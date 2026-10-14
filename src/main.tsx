import React from "react";
import ReactDOM from "react-dom/client";
import { Editor as App } from "./studio/Editor";
import "./studio/studio.css";
import { StudioApp } from "./studio/StudioApp";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <React.Suspense
      fallback={<div className="studio-loading">Opening your workspace…</div>}
    >
      {new URLSearchParams(window.location.search).get("legacy") === "1" ? (
        <App />
      ) : (
        <StudioApp />
      )}
    </React.Suspense>
  </React.StrictMode>,
);
