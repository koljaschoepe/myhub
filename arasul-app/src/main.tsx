import React from "react";
import ReactDOM from "react-dom/client";
import { Toaster } from "sonner";
import App from "./App";
import { initTheme } from "./lib/theme";
import { initDensity } from "./lib/density";
import { TooltipProvider } from "./components/ui";
import "./theme.css";

initTheme();
initDensity();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {/* TooltipProvider (Phase 1.5): single instance for the whole app so
        Radix Tooltip components share delay/skip state. Default 1.5s open
        delay matches Linear's number. */}
    <TooltipProvider delayDuration={1500} skipDelayDuration={300}>
      <App />
      <Toaster
        position="bottom-left"
        theme="system"
        richColors
        closeButton
        duration={4000}
      />
    </TooltipProvider>
  </React.StrictMode>,
);
