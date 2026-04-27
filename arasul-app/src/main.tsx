import React from "react";
import ReactDOM from "react-dom/client";
import { Toaster } from "sonner";
import App from "./App";
import { initTheme } from "./lib/theme";
import { initDensity } from "./lib/density";
import "./theme.css";

initTheme();
initDensity();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
    <Toaster
      position="bottom-left"
      theme="system"
      richColors
      closeButton
      duration={4000}
    />
  </React.StrictMode>,
);
