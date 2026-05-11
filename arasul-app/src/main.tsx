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
        // Phase 2.9 (WCAG 4.1.3 Status Messages, AA): Sonner wraps the
        // toast list in a `role="region" aria-live="polite"` container,
        // which is the W3C-recommended status-message pattern. Polite is
        // correct for our use cases (notify.ok/err are not blocking).
        // The labels + close-button aria-label below are screen-reader
        // safety nets even when richColors styling is on.
        toastOptions={{
          closeButton: true,
          classNames: {
            closeButton: "sonner-close-btn",
          },
        }}
        // Sonner uses its own aria-label string for the region; spell it
        // out plainly so non-coders know what the SR announces.
        containerAriaLabel="Notifications"
      />
    </TooltipProvider>
  </React.StrictMode>,
);
