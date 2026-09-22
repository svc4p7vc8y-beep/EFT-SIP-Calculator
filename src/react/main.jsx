import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App.jsx";
import { ProjectProvider } from "./state/ProjectContext.jsx";
import { TeamProvider } from "./cloud/TeamContext.jsx";
import "./styles/app.css";

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
  window.addEventListener("load", () =>
    navigator.serviceWorker.register("./sw.js").catch(() => {}),
  );
}
