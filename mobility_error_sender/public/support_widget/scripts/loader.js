// support_widget_loader.js

export async function LoadWidget() {
    if (window.__supportWidgetLoaded) return;
    window.__supportWidgetLoaded = true;

    window.SupportWidget = window.SupportWidget || {};

    window.SupportWidget.developerMode = false;
    window.SupportWidget.baseDir = window.SupportWidget.developerMode
        ? "/"
        : "/assets/mobility_error_sender/support_widget/";

    // dynamic import works inside async IIFE
    const { resolve_dir, showLoader, hideLoader, createLoader } = await import(
        window.SupportWidget.baseDir + "scripts/utils.js"
    );
    const { TemplateLoader } = (await import(
        resolve_dir("scripts/template.js")
    ));
    window.SupportWidget.resolve = resolve_dir;

    // Inject CSS
    const Template = new TemplateLoader({
        "widget": resolve_dir("views/widget.html"),
        "list": resolve_dir("views/list.html"),
        "ticket": resolve_dir("views/ticket.html"),
    });
    window.SupportWidget.Template = Template;
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = resolve_dir("widget.css");
    document.head.appendChild(css);
    
    // Floating button
    const btn = document.createElement("div");
    btn.id = "support-btn";
    btn.innerHTML = await SupportWidget.Template.use("widget");
    document.body.appendChild(btn);

    // App container (separate element)
    const appContainer = document.createElement("div");
    appContainer.id = "support-app";
    appContainer.style.display = "none";
    document.body.appendChild(appContainer);

    window.SupportWidget.button = btn;
    window.SupportWidget.root = appContainer;
    const lightbox = document.createElement("div");
    lightbox.id = "sw-lightbox";
    lightbox.innerHTML = `
        <div class="sw-lightbox-overlay"></div>
        <img class="sw-lightbox-img" />
    `;
    document.body.appendChild(lightbox);




    window.SupportWidget.app = null;
    createLoader();
    btn.addEventListener("click", async () => {

        showLoader("button");

        try {
            if (!window.SupportWidget.app) {
            const { initWidget } = await import(
                resolve_dir("scripts/widget.js")
            );

            window.SupportWidget.app = initWidget();
            }

            await window.SupportWidget.app.toggle();

        } finally {
            hideLoader();
        }
    });

}