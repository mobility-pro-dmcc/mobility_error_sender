/*
 * Mobility Error Sender
 * ---------------------
 * Adds a "Send Ticket To Support" button (+ optional screenshot) to every
 * message / error dialog in the desk and files a Desk365 ticket from it.
 *
 * Which dialogs get the button is decided in the "desk365" settings, without
 * touching the code that raises the message:
 *   1. per call (JS only):  frappe.msgprint({message, support_button: true|false})
 *                           frappe.throw({message, support_button: false})
 *   2. message rules:       first matching row of "Message Rules" (title / text match)
 *   3. message type:        "Show on Errors" / "Show on Messages"
 */

const secondaryIconSvg = `
    <svg xmlns="http://www.w3.org/2000/svg"
        width="18" height="18" viewBox="0 0 24 24" fill="none"
        class="secondary-btn-icon">
    <path d="M12.5263 2C17.7579 2 22 6.47777 22 12C22 17.5222 17.7579 22 12.5263 22H5.15789C3.41579 22 2 20.5055 2 18.6667V15.3333H10.3429V19.7778H12.5263C16.5947 19.7778 19.8947 16.2945 19.8947 12C19.8947 7.70555 16.5947 4.22222 12.5263 4.22222H10.3429V8.66667H2V5.33333C2 3.49445 3.41579 2 5.15789 2H12.5263Z"
            fill="currentColor"></path>
    </svg>
`;

const MES_SCREENSHOT_MAX_WIDTH = 1920;
const MES_SCREENSHOT_QUALITY = 0.8;

function parse_server_message(item) {
    if (typeof item !== "string") return item || {};
    try {
        return JSON.parse(item);
    } catch (e) {
        return { message: item };
    }
}

function format_messages(data) {
    const result = data.map(item => {
        const parsedItem = parse_server_message(item);
        let msg = parsedItem.message || "";

        // Check if raise_exception exists and is truthy
        if (parsedItem.raise_exception) {
            msg = `<div style="background-color: rgba(255, 0, 0, 0.07); padding: 10px 5px; border-radius: 4px;">${msg}</div>`;
        }

        return msg;
    }).join("<hr>");
    return result;
}

function patch_textboxes_for_capture(clonedDoc, root = null) {
    root = root || clonedDoc.body;

    const controls = root.querySelectorAll(
        'input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="hidden"]), textarea, [contenteditable="true"]'
    );

    controls.forEach((el) => {
        // Skip elements that are not actually visible
        const cs = clonedDoc.defaultView.getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return;

        // Get the rendered value
        let value = "";
        if (el.matches('input, textarea')) {
            value = el.value ?? "";
        } else if (el.getAttribute("contenteditable") === "true") {
            value = el.innerText ?? "";
        }

        // If empty, nothing to patch
        if (!value) return;

        // Create a replacement node that looks like the input
        const div = clonedDoc.createElement("div");
        div.textContent = value;

        // Copy key computed styles so it looks the same
        div.style.boxSizing = "border-box";
        div.style.whiteSpace = "pre-wrap";     // keep line breaks
        div.style.wordBreak = "break-word";
        div.style.overflow = "hidden";

        // Use computed styles instead of offset sizes (offset can be 0 in clone)
        div.style.minHeight = cs.height;
        div.style.width = cs.width;

        // copy typography + spacing
        div.style.font = cs.font;
        div.style.fontSize = cs.fontSize;
        div.style.fontFamily = cs.fontFamily;
        div.style.fontWeight = cs.fontWeight;
        div.style.lineHeight = cs.lineHeight;
        div.style.letterSpacing = cs.letterSpacing;

        div.style.paddingTop = cs.paddingTop;
        div.style.paddingRight = cs.paddingRight;
        div.style.paddingBottom = cs.paddingBottom;
        div.style.paddingLeft = cs.paddingLeft;

        div.style.borderTop = cs.borderTop;
        div.style.borderRight = cs.borderRight;
        div.style.borderBottom = cs.borderBottom;
        div.style.borderLeft = cs.borderLeft;

        div.style.borderRadius = cs.borderRadius;
        div.style.background = cs.background;
        div.style.color = cs.color;

        // RTL/LTR handling (important for Arabic)
        div.style.direction = cs.direction || "rtl";
        div.style.textAlign = cs.textAlign;
        div.style.unicodeBidi = "plaintext";

        // Keep it in the same place in layout
        div.style.display = cs.display === "inline" ? "inline-block" : cs.display;

        // Replace original control
        el.replaceWith(div);
    });
}

/* ------------------------------------------------------------------ */
/* Settings: should this message get the support button?              */
/* ------------------------------------------------------------------ */

function mes_settings() {
    return (frappe.boot && frappe.boot.mobility_error_sender) || {
        show_on_errors: 1,
        show_on_messages: 0,
        screenshot_method: "Browser Capture",
        rules: [],
    };
}

// settings saved in "desk365" are pushed live to every open tab (see boot.py)
if (frappe.realtime && frappe.realtime.on) {
    frappe.realtime.on("mobility_error_sender_settings", (settings) => {
        if (settings && frappe.boot) frappe.boot.mobility_error_sender = settings;
    });
}

function html_to_text(html) {
    if (html == null) return "";
    if (Array.isArray(html)) html = html.flat().join(" ");
    // DOMParser documents are inert: no scripts run, no images load
    const doc = new DOMParser().parseFromString(String(html), "text/html");
    return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
}

function rule_matches(rule, texts) {
    const needle = (rule.match_text || "").replace(/\s+/g, " ").trim();
    if (!needle) return false;

    let regex = null;
    if (rule.match_type === "Regex") {
        try {
            regex = new RegExp(needle, "i");
        } catch (e) {
            console.warn("[support button] invalid regex in rule:", needle);
            return false;
        }
    }

    const lower_needle = needle.toLowerCase();
    return texts.some((text) => {
        if (!text) return false;
        if (regex) return regex.test(text);
        const lower = text.toLowerCase();
        if (rule.match_type === "Exact") return lower === lower_needle;
        if (rule.match_type === "Starts With") return lower.startsWith(lower_needle);
        return lower.includes(lower_needle);
    });
}

// type: "error" | "message"
function support_button_allowed(type, message, title, override) {
    if (override === true || override === false) return override;

    const settings = mes_settings();
    const type_label = type === "error" ? "Error" : "Message";
    const texts = [html_to_text(title), html_to_text(message)];

    for (const rule of settings.rules || []) {
        if (rule.applies_to && rule.applies_to !== "Both" && rule.applies_to !== type_label) continue;
        if (rule_matches(rule, texts)) return rule.action === "Show Button";
    }

    return Boolean(type === "error" ? settings.show_on_errors : settings.show_on_messages);
}

/* ------------------------------------------------------------------ */
/* Screenshot                                                          */
/* ------------------------------------------------------------------ */

function to_jpeg(source, width, height) {
    const ratio = Math.min(1, MES_SCREENSHOT_MAX_WIDTH / width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", MES_SCREENSHOT_QUALITY);
}

function is_capture_overlay(el, dialog) {
    if (!el || el.nodeType !== 1) return false;
    if (dialog && el === dialog.$wrapper[0]) return true;
    if (el.id === "freeze") return true;
    return el.classList.contains("modal-backdrop") || el.classList.contains("freeze");
}

// hide the support dialog / backdrops / freeze layer, return a function that restores them
function hide_overlays(dialog) {
    const elements = [dialog.$wrapper[0], ...document.querySelectorAll(".modal-backdrop, #freeze, .freeze")];
    const previous = elements.map((el) => [el, el.style.visibility]);
    elements.forEach((el) => (el.style.visibility = "hidden"));
    return () => previous.forEach(([el, value]) => (el.style.visibility = value));
}

function wait_for_fresh_frames(video, count) {
    return new Promise((resolve) => {
        // a static page may stop producing frames, so never wait forever
        const deadline = setTimeout(resolve, 800);
        if (!video.requestVideoFrameCallback) {
            clearTimeout(deadline);
            setTimeout(resolve, 350);
            return;
        }
        let seen = 0;
        const on_frame = () => {
            if (++seen >= count) {
                clearTimeout(deadline);
                resolve();
            } else {
                video.requestVideoFrameCallback(on_frame);
            }
        };
        // start counting once the overlays are really gone from the page
        requestAnimationFrame(() => requestAnimationFrame(() => video.requestVideoFrameCallback(on_frame)));
    });
}

// Native tab capture: instant and pixel-exact, but the browser asks for permission
async function capture_with_display_media(dialog) {
    const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "browser", frameRate: 15 },
        audio: false,
        preferCurrentTab: true,
        selfBrowserSurface: "include",
        surfaceSwitching: "exclude",
        monitorTypeSurfaces: "exclude",
    });

    const video = document.createElement("video");
    let restore = null;
    try {
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;
        await video.play();

        restore = hide_overlays(dialog);
        await wait_for_fresh_frames(video, 3);
        return to_jpeg(video, video.videoWidth, video.videoHeight);
    } finally {
        if (restore) restore();
        stream.getTracks().forEach((track) => track.stop());
        video.srcObject = null;
    }
}

// html2canvas fallback: renders only the visible viewport, not the whole page
async function capture_with_html2canvas(dialog) {
    if (typeof html2canvas === "undefined") throw new Error("html2canvas not loaded");

    let background = getComputedStyle(document.body).backgroundColor;
    if (!background || background === "transparent" || background === "rgba(0, 0, 0, 0)") {
        background = "#ffffff";
    }

    const canvas = await html2canvas(document.body, {
        backgroundColor: background,
        scale: 1,
        useCORS: true,
        logging: false,
        imageTimeout: 2000, // default is 15s per image
        x: window.scrollX,
        y: window.scrollY,
        width: window.innerWidth,
        height: window.innerHeight,
        ignoreElements: (el) => is_capture_overlay(el, dialog),
        onclone: (clonedDoc) => patch_textboxes_for_capture(clonedDoc, clonedDoc.body),
    });
    return to_jpeg(canvas, canvas.width, canvas.height);
}

async function capture_screenshot(dialog) {
    const use_browser_capture =
        mes_settings().screenshot_method !== "Page Render" &&
        navigator.mediaDevices &&
        navigator.mediaDevices.getDisplayMedia;

    if (use_browser_capture) {
        try {
            return await capture_with_display_media(dialog);
        } catch (e) {
            console.warn("[support button] browser capture unavailable, using page render", e);
        }
    }

    try {
        return await capture_with_html2canvas(dialog);
    } catch (e) {
        console.warn("[support button] screenshot capture failed", e);
        return null;
    }
}

/* ------------------------------------------------------------------ */
/* Support bar (checkbox + button) — added ONCE per dialog             */
/* ------------------------------------------------------------------ */

function set_capture_state(ui, state) {
    const labels = {
        idle: __("Capture Screen"),
        busy: __("Capturing screen, please wait..."),
        done: __("Screen Captured"),
        failed: __("Capture Failed"),
    };
    ui.$label.text(labels[state] || labels.idle);
    ui.$bar.attr("data-capture", state);
    // no double capture, and no sending half-way through a capture
    const busy = state === "busy";
    ui.$cb.prop("disabled", busy);
    ui.$bar.find(".mes-send-btn").prop("disabled", busy);
}

// let the browser draw the "please wait" state before the capture starts:
// the page render blocks the main thread, so without this the click looks frozen
function after_next_paint() {
    return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 50)));
}

function reset_capture(ui) {
    ui.shot = null;
    ui.shot_token = null;
    ui.$cb.prop("checked", false);
    set_capture_state(ui, "idle");
}

function start_capture(dialog, ui) {
    const token = {};
    ui.shot_token = token;
    set_capture_state(ui, "busy");
    ui.shot = after_next_paint()
        .then(() => capture_screenshot(dialog))
        .catch(() => null)
        .then((data) => {
            if (ui.shot_token === token) set_capture_state(ui, data ? "done" : "failed");
            return data;
        });
}

function ensure_support_ui(dialog) {
    if (dialog.__mes_ui) return dialog.__mes_ui;

    const $bar = $(`
        <div class="mes-support-bar hide">
            <label class="mes-capture">
                <input type="checkbox" class="form-check-input mes-capture-cb">
                <span class="mes-spinner" aria-hidden="true"></span>
                <span class="mes-capture-label"></span>
            </label>
            <button type="button" class="btn btn-sm my-secondary-btn mes-send-btn">
                ${secondaryIconSvg}<span class="secondary-btn-label">${__("Send Ticket To Support")}</span>
            </button>
        </div>
    `);
    dialog.footer.prepend($bar);

    const ui = {
        $bar,
        $cb: $bar.find(".mes-capture-cb"),
        $label: $bar.find(".mes-capture-label"),
        items: [],
        shot: null,
        shot_token: null,
    };

    ui.$cb.on("change", function () {
        if (this.checked) {
            start_capture(dialog, ui);
        } else {
            reset_capture(ui);
        }
    });
    $bar.find(".mes-send-btn").on("click", () => send_to_support(dialog, ui));

    reset_capture(ui);
    dialog.__mes_ui = ui;
    return ui;
}

function refresh_support_ui(dialog, ui) {
    const visible = ui.items.some((item) => item.allowed);
    ui.$bar.toggleClass("hide", !visible);

    if (visible) {
        dialog.footer.removeClass("hide");
    } else {
        const other_buttons = dialog.footer
            .find("button")
            .not(ui.$bar.find("button"))
            .filter((_, btn) => !$(btn).hasClass("hide"));
        if (!other_buttons.length) dialog.footer.addClass("hide");
    }
}

// start a new batch of messages on a dialog
function prepare_support_ui(dialog, items) {
    const ui = ensure_support_ui(dialog);
    reset_capture(ui);
    ui.items = items;
    refresh_support_ui(dialog, ui);
}

/* ------------------------------------------------------------------ */
/* Ticket                                                              */
/* ------------------------------------------------------------------ */

function get_context(con = {}) {
    const kind = con.type === "message" ? __("Message") : __("Error");
    const info = {
        context: null,
        doctype: null,
        title: con.title || kind,
        docname: null,
        report_name: null,
        page_link: window.location.href,
        message: con.msg || null,
        message_type: con.type === "message" ? "Message" : "Error",
        traceback: con.exc || null,
        user: {
            name: frappe.session.user_fullname,
            email: frappe.session.user
        },
        domain: window.location.origin,
        screenshot: con.screenshot || null
    };

    try {
        const route = frappe.get_route() || [];
        // cur_frm keeps the last opened form, so also check the route
        if (route[0] === "Form" && window.cur_frm && cur_frm.doc && cur_frm.doctype === route[1]) {
            info.context = "Form";
            info.doctype = cur_frm.doctype;
            info.docname = cur_frm.docname;
            info.title = `${info.doctype} - ${cur_frm.docname} ${kind}`;
            info.doc_dict = cur_frm.doc;
        } else if (route[0] === "List") {
            info.context = "List";
            info.doctype = route[1];
            info.title = `${info.doctype} List ${kind}`;
        } else if (route[0] === "query-report") {
            info.context = "Report";
            info.report_name = route[1];
            info.title = `Report: ${info.report_name} ${kind}`;
        } else if (frappe.pages && route[0] === "page") {
            info.context = "Page";
            info.title = `Page: ${route[1]} ${kind}`;
        } else {
            info.context = "Other";
        }
    } catch (e) {
        console.warn("context detection failed", e);
    }
    return info;
}

function dialog_message_html(dialog) {
    if (dialog === frappe.msg_dialog && dialog.msg_area) return dialog.msg_area.html();
    return dialog.$body.html();
}

async function send_to_support(dialog, ui) {
    const type = ui.items.some((item) => item.type === "error") ? "error" : "message";
    const exc = [...ui.items].reverse().find((item) => item.exc)?.exc || null;
    const message = dialog_message_html(dialog);
    // set_title() only updates the header, not dialog.title
    const title = (dialog.header && dialog.header.find(".modal-title").text().trim()) || dialog.title;
    const pending_shot = ui.$cb.prop("checked") ? ui.shot : null;

    dialog.hide();
    frappe.dom.freeze(__("Sending..."));

    try {
        const screenshot = pending_shot ? await pending_shot : null;
        const r = await frappe.call({
            method: "mobility_error_sender.events.send_error_report",
            args: get_context({ msg: message, exc, title, type, screenshot }),
        });

        if (r.message && r.message.success) {
            frappe.msgprint({
                message: __("Your Request Has Been Sent Successfully"),
                indicator: "green",
                support_button: false,
            });
        } else {
            frappe.msgprint({ message: __("Failed to send request"), indicator: "red", support_button: false });
        }
    } catch (e) {
        console.error(e);
        frappe.msgprint({ message: __("Failed to send request"), indicator: "red", support_button: false });
    } finally {
        frappe.dom.unfreeze();
    }
}

/* ------------------------------------------------------------------ */
/* msgprint / throw                                                    */
/* ------------------------------------------------------------------ */

// mirrors how frappe.msgprint reads its arguments; null = nothing to track
function parse_msgprint_args(msg, title) {
    if (!msg) return null;
    let data;
    if ($.isPlainObject(msg)) {
        data = msg;
    } else if (typeof msg === "string" && msg.substr(0, 1) === "{") {
        try {
            data = JSON.parse(msg);
        } catch (e) {
            return null;
        }
    } else {
        data = { message: msg, title: title };
    }
    // arrays are split by frappe.msgprint into one call per message; alerts are toasts
    if (data.alert || data.toast) return null;
    if (Array.isArray(data.message) && !data.as_list && !data.as_table) return null;
    return data;
}

const mes_original_msgprint = frappe.msgprint;

frappe.msgprint = function (msg, title, is_minimizable) {
    const data = parse_msgprint_args(msg, title);
    const md = frappe.msg_dialog;
    const new_batch = !md || !md.msg_area || !md.msg_area.html() || (data && data.clear);

    const dialog = mes_original_msgprint.apply(this, arguments);

    if (data && dialog && dialog === frappe.msg_dialog) {
        try {
            const type = data.__mes_type === "error" || data.raise_exception ? "error" : "message";
            const item = {
                type,
                exc: data.__mes_exc || null,
                allowed: support_button_allowed(type, data.message, data.title, data.support_button),
            };
            if (new_batch) {
                prepare_support_ui(dialog, [item]);
            } else {
                const ui = ensure_support_ui(dialog);
                ui.items.push(item);
                refresh_support_ui(dialog, ui);
            }
        } catch (e) {
            console.warn("[support button] could not attach to message", e);
        }
    }
    return dialog;
};
window.msgprint = frappe.msgprint;

frappe.throw = function (msg) {
    if (typeof msg === "string") {
        msg = { message: msg, title: __("Error") };
    }
    if (!msg.indicator) msg.indicator = "red";
    frappe.msgprint(Object.assign({}, msg, { __mes_type: "error" }));
    throw new Error(msg.message);
};

/* ------------------------------------------------------------------ */
/* Server errors                                                       */
/* ------------------------------------------------------------------ */

frappe.request.report_error = function (xhr, request_opts) {
    console.error("Server Error", xhr.responseText, request_opts);
    var data = JSON.parse(xhr.responseText);
    var exc;
    if (data.exc) {
        try {
            exc = (JSON.parse(data.exc) || []).join("\n");
        } catch (e) {
            exc = data.exc;
        }
        delete data.exc;
    } else {
        exc = "";
    }

    const copy_markdown_to_clipboard = () => {
        const code_block = (snippet) => "```\n" + snippet + "\n```";

        let request_data = Object.assign({}, request_opts);
        request_data.request_id = xhr.getResponseHeader("X-Frappe-Request-Id");
        const traceback_info = [
            "### App Versions",
            code_block(JSON.stringify(frappe.boot.versions, null, "\t")),
            "### Route",
            code_block(frappe.get_route_str()),
            "### Traceback",
            code_block(exc),
            "### Request Data",
            code_block(JSON.stringify(request_data, null, "\t")),
            "### Response Data",
            code_block(JSON.stringify(data, null, "\t")),
        ].join("\n");
        frappe.utils.copy_to_clipboard(traceback_info);
    };

    var show_communication = function () {
        var error_report_message = [
            "<h5>Please type some additional information that could help us reproduce this issue:</h5>",
            '<div style="min-height: 100px; border: 1px solid #bbb; \
                border-radius: 5px; padding: 15px; margin-bottom: 15px;"></div>',
            "<hr>",
            "<h5>App Versions</h5>",
            "<pre>" + JSON.stringify(frappe.boot.versions, null, "\t") + "</pre>",
            "<h5>Route</h5>",
            "<pre>" + frappe.get_route_str() + "</pre>",
            "<hr>",
            "<h5>Error Report</h5>",
            "<pre>" + exc + "</pre>",
            "<hr>",
            "<h5>Request Data</h5>",
            "<pre>" + JSON.stringify(request_opts, null, "\t") + "</pre>",
            "<hr>",
            "<h5>Response JSON</h5>",
            "<pre>" + JSON.stringify(data, null, "\t") + "</pre>",
        ].join("\n");

        var communication_composer = new frappe.views.CommunicationComposer({
            subject: "Error Report [" + frappe.datetime.nowdate() + "]",
            recipients: error_report_email,
            message: error_report_message,
            doc: {
                doctype: "User",
                name: frappe.session.user,
            },
        });
        communication_composer.dialog.$wrapper.css(
            "z-index",
            cint(frappe.msg_dialog.$wrapper.css("z-index")) + 1
        );
    };

    if (exc) {
        var error_report_email = frappe.boot.error_report_email;

        request_opts = frappe.request.cleanup_request_opts(request_opts);

        if (!frappe.error_dialog) {
            frappe.error_dialog = new frappe.ui.Dialog({
                title: __("Server Error"),
            });

            if (error_report_email) {
                frappe.error_dialog.set_primary_action(__("Report"), () => {
                    show_communication();
                    frappe.error_dialog.hide();
                });
            } else {
                frappe.error_dialog.set_primary_action(__("Copy error to clipboard"), () => {
                    copy_markdown_to_clipboard();
                    frappe.error_dialog.hide();
                });
            }
            frappe.error_dialog.wrapper.classList.add("msgprint-dialog");
        }

        let parts = strip(exc).split("\n");

        let dialog_html = parts[parts.length - 1];

        if (data._exc_source) {
            dialog_html += "<br>";
            dialog_html += `Possible source of error: ${data._exc_source.bold()} `;
        }

        frappe.error_dialog.$body.html(dialog_html);
        prepare_support_ui(frappe.error_dialog, [{
            type: "error",
            exc,
            allowed: support_button_allowed("error", dialog_html, __("Server Error")),
        }]);
        frappe.error_dialog.show();
    }
};

frappe.request.cleanup = function (opts, r) {
    // stop button indicator
    if (opts.btn) {
        $(opts.btn).prop("disabled", false);
    }

    $("body").attr("data-ajax-state", "complete");

    // un-freeze page
    if (opts.freeze) frappe.dom.unfreeze();

    if (r) {
        // session expired? - Guest has no business here!
        if (
            r.session_expired ||
            (frappe.session.user === "Guest" && frappe.session.logged_in_user !== "Guest")
        ) {
            frappe.app.handle_session_expired();
            return;
        }

        // error handlers
        let global_handlers = frappe.request.error_handlers[r.exc_type] || [];
        let request_handler = opts.error_handlers ? opts.error_handlers[r.exc_type] : null;
        let handlers = [].concat(global_handlers, request_handler).filter(Boolean);

        if (r.exc_type) {
            handlers.forEach((handler) => {
                handler(r);
            });
        }

        // show messages
        let messages;
        if (opts.api_version == "v2") {
            messages = r.messages;
        } else if (r._server_messages) {
            messages = JSON.parse(r._server_messages);
        }
        if (messages && !opts.silent) {
            // show server messages if no handlers exist
            if (handlers.length === 0) {
                frappe.hide_msgprint();
                if (r.exc) {
                    const last = messages[messages.length - 1];
                    frappe.msgprint({
                        title: parse_server_message(last).title || __("Message"),
                        message: format_messages([last]),
                        indicator: "red",
                        __mes_type: "error",
                        __mes_exc: r.exc,
                    });
                } else {
                    frappe.msgprint(messages);
                }
            }
        }
        // show errors
        if (r.exc) {
            r.exc = JSON.parse(r.exc);
            if (r.exc instanceof Array) {
                r.exc.forEach((exc) => {
                    if (exc) {
                        console.error(exc);
                    }
                });
            } else {
                console.error(r.exc);
            }
        }

        // debug messages
        if (r._debug_messages) {
            if (opts.args) {
                console.log("======== arguments ========");
                console.log(opts.args);
            }
            console.log("======== debug messages ========");
            $.each(JSON.parse(r._debug_messages), function (i, v) {
                console.log(v);
            });
            console.log("======== response ========");
            delete r._debug_messages;
            console.log(r);
            console.log("========");
        }
    }

    frappe.last_response = r;
};
