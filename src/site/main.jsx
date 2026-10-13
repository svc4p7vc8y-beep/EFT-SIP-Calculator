import React from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import Site from "./Site.jsx";
import "./site.css";
import "./hero-intro.css";

const root = document.getElementById("root");
const app = (
  <React.StrictMode>
    <Site />
  </React.StrictMode>
);

if (root.hasChildNodes()) hydrateRoot(root, app);
else createRoot(root).render(app);
