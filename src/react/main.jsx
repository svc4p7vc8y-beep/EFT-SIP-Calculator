import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App.jsx";
import { ProjectProvider } from "./state/ProjectContext.jsx";
import { TeamProvider } from "./cloud/TeamContext.jsx";
import "./styles/app.css";

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
