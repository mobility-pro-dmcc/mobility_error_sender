(async ()=>{
    const baseDir = "/assets/mobility_error_sender/support_widget/";
    const { LoadWidget } = await import(baseDir + "scripts/loader.js");
    window.LoadWidget = LoadWidget;
    console.log("Loading widget...", LoadWidget);
    LoadWidget();
})();