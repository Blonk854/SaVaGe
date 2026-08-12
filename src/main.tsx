import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/syne";
import "@fontsource-variable/dm-sans";
import "./app/theme.css";
import App from "./app/App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
