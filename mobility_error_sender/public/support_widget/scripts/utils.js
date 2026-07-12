export function resolve_dir(url){
    return (window.SupportWidget.baseDir + url).replace("//", "/");
}

export function createLoader() {
  const root = window.SupportWidget.root;
  if (root.querySelector("#sw-loader")) return;

  const loader = document.createElement("div");
  loader.id = "sw-loader";
  loader.innerHTML = `
    <div class="sw-loader-backdrop"></div>
    <div class="sw-loader-spinner"></div>
  `;

  root.appendChild(loader);
}

export function showLoader() {
  const loader = window.SupportWidget.root.querySelector("#sw-loader");
  loader?.classList.add("active");
}

export function hideLoader() {
  const loader = window.SupportWidget.root.querySelector("#sw-loader");
  loader?.classList.remove("active");
}