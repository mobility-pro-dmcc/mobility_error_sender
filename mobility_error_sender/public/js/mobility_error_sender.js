const secondaryIconSvg = `
    <svg xmlns="http://www.w3.org/2000/svg"
        width="18" height="18" viewBox="0 0 24 24" fill="none"
        class="secondary-btn-icon">
    <path d="M12.5263 2C17.7579 2 22 6.47777 22 12C22 17.5222 17.7579 22 12.5263 22H5.15789C3.41579 22 2 20.5055 2 18.6667V15.3333H10.3429V19.7778H12.5263C16.5947 19.7778 19.8947 16.2945 19.8947 12C19.8947 7.70555 16.5947 4.22222 12.5263 4.22222H10.3429V8.66667H2V5.33333C2 3.49445 3.41579 2 5.15789 2H12.5263Z"
            fill="currentColor"></path>
    </svg>
`;

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

        // match geometry
        const r = el.getBoundingClientRect();
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
};

async function get_context(con = {}, with_screenshot = false) {
    const info = {
        context: null,
        doctype: null,
        title: con.title || __("Error"),
        docname: null,
        report_name: null,
        page_link: window.location.href,
        message: con.msg || null,
        traceback: con.exc || null,
        user: {
            name: frappe.session.user_fullname,
            email: frappe.session.user
        },
        domain: window.location.origin,
        screenshot: null
    };

    try {
        // detect where user is
        if (cur_frm && cur_frm.doc) {
            info.context = "Form";
            info.doctype = cur_frm.doctype;
            info.docname = cur_frm.docname;
            info.title = `${info.doctype} - ${cur_frm.docname} Error`;
        } else if (frappe.listview_settings && frappe.get_route()[0] === "List") {
            info.context = "List";
            info.doctype = frappe.get_route()[1];
            info.title = `${info.doctype} List Error`;
        } else if (frappe.get_route()[0] === "query-report") {
            info.context = "Report";
            info.report_name = frappe.get_route()[1];
            info.title = `Report: ${info.report_name} Error`;
        } else if (frappe.pages && frappe.get_route()[0] === "page") {
            info.context = "Page";
            info.title = `Page: ${frappe.get_route()[1]} Error`;
        } else {
            info.context = "Other";
        }
    } catch (e) {
        console.warn("context detection failed", e);
    }
    if (!with_screenshot) {
        info.screenshot = window.screenshot;
    }
    return info;
};
async function capture_screenshot() {
    frappe.dom.freeze(__("capturing screenshot may take a while..."));
    setTimeout(async () => {
        try {
            if (typeof html2canvas !== "undefined") {
                const canvas = await html2canvas(document.body, { 
                    backgroundColor: null,
                    scale: 1,
                    foreignObjectRendering: true,
                    useCORS: true,
            ignoreElements: (el) => el.classList?.contains("freeze") || el.id === "freeze",
            onclone: (clonedDoc) => {
            patch_textboxes_for_capture(clonedDoc, clonedDoc.body);
            }
                });
                window.screenshot = canvas.toDataURL("image/png", 0.1);
            } else {
                console.warn("html2canvas not loaded");
            }
        } catch (e) {
            console.warn("screenshot capture failed", e);
        }
        frappe.dom.unfreeze();
    }, 100);
}

async function send_error(con = {}) {
    // hide the dialog you created (NOT cur_dialog)
    
    // allow UI to repaint (dialog actually disappears)
    await new Promise((r) => requestAnimationFrame(r));
    
    // freeze (do NOT await freeze)
                if (cur_dialog) cur_dialog.hide();
    frappe.dom.freeze(__("Sending..."));
    
    setTimeout(async() => {	
        try {
            const context = await get_context(con);
            
            const r = await frappe.call({
                method: "mobility_error_sender.events.send_error_report",
                args: context
            });
            
            if (r.message && r.message.success) {
                frappe.msgprint("Your Request Has Been Sent Successfuly");
            } else {
                frappe.msgprint("Failed to send request");
            }
        } catch (e) {
            console.error(e);
            frappe.msgprint("Failed to send request");
        } finally {
            frappe.dom.unfreeze();
        }
    }, 500);
};

frappe.request.report_error = function (xhr, request_opts) {
    console.log(xhr.responseText)
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

        // window.msg_dialog = frappe.msgprint({message:error_message, indicator:'red', big: true});

        if (!frappe.error_dialog) {
            frappe.error_dialog = new frappe.ui.Dialog({
                title: __("Server Error"),
                secondary_action_label: __("Send Ticket To Support"),
                secondary_action: function (){ send_error({exc, msg:strip(exc).split("\n")[strip(exc).split("\n").length - 1]});}
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
            frappe.error_dialog.on_page_show = () => {
                const $btn = frappe.error_dialog.$wrapper.find(".modal-footer .btn-secondary");
                if (!$btn.length) return;

                $btn.addClass("my-secondary-btn");

                const plainLabel = ($btn.text() || "Send Ticket To Support").trim();
                $btn.html(`${secondaryIconSvg}<span class="secondary-btn-label">${plainLabel}</span>`);
                checkbox = $(`
                    <div class="form-check me-3 d-flex align-items-center">
                        <input type="checkbox" class="form-check-input" id="confirm_cb">
                        <label class="form-check-label ms-2" for="confirm_cb">
                            Capture Screen
                        </label>
                    </div>
                `);
                frappe.error_dialog.footer.prepend(checkbox);
                checkbox.find("input").on("change", function () {
                    if (this.checked === true) {
                        capture_screenshot();
                    }
                });
            };
            frappe.error_dialog.wrapper.classList.add("msgprint-dialog");
        }

        let parts = strip(exc).split("\n");

        let dialog_html = parts[parts.length - 1];

        if (data._exc_source) {
            dialog_html += "<br>";
            dialog_html += `Possible source of error: ${data._exc_source.bold()} `;
        }

        frappe.error_dialog.$body.html(dialog_html);
        frappe.error_dialog.show();

    }
};

function open_throw_dialog(msg){
    let d = new frappe.ui.Dialog({
        title: msg.title,
        fields: [
            {
                label: 'Message',
                fieldname: 'msg',
                fieldtype: 'HTML',
                options: `<div>${msg.message}</div>`
            }
        ],
        primary_action_label: 'Close',
        primary_action() {
            d.hide();
        },
        secondary_action_label: 'Send Ticket To Support',
        secondary_action: function() { send_error({exc: msg.exc || null, msg: msg.message || null}) }
    });
    d.on_page_show = () => {
        const $btn = d.$wrapper.find(".modal-footer .btn-secondary");
        if (!$btn.length) return;

        $btn.addClass("my-secondary-btn");

        const plainLabel = ($btn.text() || "Send Ticket To Support").trim();
        $btn.html(`${secondaryIconSvg}<span class="secondary-btn-label">${plainLabel}</span>`);
        checkbox = $(`
            <div class="form-check me-3 d-flex align-items-center">
                <input type="checkbox" class="form-check-input" id="confirm_cb">
                <label class="form-check-label ms-2" for="confirm_cb">
                    Capture Screen
                </label>
            </div>
        `);
        d.footer.prepend(checkbox);
        checkbox.find("input").on("change", function () {
            if (this.checked === true) {
                capture_screenshot();
            }
        });
    };
    d.show();
}

frappe.throw = function(msg) {
    if (typeof msg === "string") {
        msg = { message: msg, title: __("Error") };
    }
    if (!msg.indicator) msg.indicator = "red";
    error = new Error(msg.message);
    // Show dialog instead of immediate throw
    open_throw_dialog(msg);
    throw error;
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
        //
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
        console.log(messages)
        open_throw_dialog({
            title: __("Message"),
            message: JSON.parse(messages[0]).message,
            exc: r.exc
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