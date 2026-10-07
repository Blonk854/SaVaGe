import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/syne";
import "@fontsource-variable/dm-sans";
import "./app/theme.css";
import App from "./app/App";
import { installOpenImagePresentObserver } from "./shared/release/presentFrame";

function showBootError(message: string) {
  const root = document.getElementById("root");
  if (!root) return;
  root.innerHTML = `<pre style="padding:24px;color:#ff5c5c;white-space:pre-wrap">${message}</pre>`;
}

window.addEventListener("error", (e) => {
  if (!document.getElementById("root")?.querySelector(".shell")) {
    showBootError(e.message || String(e.error ?? "Unknown error"));
  }
});
window.addEventListener("unhandledrejection", (e) => {
  if (!document.getElementById("root")?.querySelector(".shell")) {
    showBootError(e.reason instanceof Error ? e.reason.message : String(e.reason));
  }
});

installOpenImagePresentObserver();

const el = document.getElementById("root");
if (!el) {
  throw new Error("Missing #root");
}

try {
  ReactDOM.createRoot(el).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
} catch (e) {
  showBootError(e instanceof Error ? e.stack || e.message : String(e));
}
