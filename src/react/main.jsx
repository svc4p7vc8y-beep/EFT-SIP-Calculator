import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App.jsx";
import { ProjectProvider } from "./state/ProjectContext.jsx";
import { TeamProvider } from "./cloud/TeamContext.jsx";
import "./styles/app.css";
import "./styles/black-ink.css";

// A tab left open during deployment can request a chunk from the previous build.
// Reload once to obtain the current HTML and asset names; repeated failures are
// handled by the screen error boundary instead of causing a reload loop.
window.addEventListener("vite:preloadError", (event) => {
  const retryKey = "eft-chunk-reload-at";
  try {
    const lastRetry = Number(sessionStorage.getItem(retryKey)) || 0;
    if (Date.now() - lastRetry < 60_000) return;
    sessionStorage.setItem(retryKey, String(Date.now()));
  } catch {
    return;
  }
  event.preventDefault();
  window.location.reload();
});

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <TeamProvider>
      <ProjectProvider>
        <App />
      </ProjectProvider>
    </TeamProvider>
  </React.StrictMode>,
);

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js", { updateViaCache: 'none' }).then((registration) => {
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.addEventListener('controllerchange', () => window.dispatchEvent(new Event('eft:app-update-ready')));
      }
      window.setInterval(() => registration.update().catch(() => {}), 5 * 60 * 1000);
      window.addEventListener('focus', () => registration.update().catch(() => {}));
    }).catch(() => {});
  });
}

// The service worker script can stay unchanged across application releases.
// Compare the versioned entry asset so an open tab also notices those releases.
const entryAsset = document.querySelector('script[type="module"][src]')?.src;
if (entryAsset && location.protocol !== 'file:') {
  const checkBuild = async () => {
    try {
      const response = await fetch('./react.html?build-check=1', { cache: 'no-store' });
      if (!response.ok) return;
      const document = new DOMParser().parseFromString(await response.text(), 'text/html');
      const nextAsset = document.querySelector('script[type="module"][src]')?.getAttribute('src');
      if (nextAsset && new URL(nextAsset, response.url).href !== entryAsset) {
        window.dispatchEvent(new Event('eft:app-update-ready'));
      }
    } catch { /* Offline use remains available through the service worker. */ }
  };
  window.addEventListener('focus', checkBuild);
  window.setInterval(checkBuild, 2 * 60 * 1000);
}
