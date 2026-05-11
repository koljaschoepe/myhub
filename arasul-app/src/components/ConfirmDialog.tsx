/**
 * Phase 10.5 (2026-05-11) — styled confirmation dialog for sensitive
 * operations. Replaces ad-hoc `window.confirm()` calls so the look
 * matches the rest of the app and screen readers get a proper alert.
 *
 * Imperative API (Sonner-style):
 *
 *   import { confirm } from "../components/ConfirmDialog";
 *   const ok = await confirm({
 *     title: "Delete run?",
 *     description: "This can't be undone.",
 *     confirmLabel: "Delete",
 *     destructive: true,
 *   });
 *   if (!ok) return;
 *
 * Mount `<ConfirmDialogHost />` once near the root of the app (next to
 * `<Toaster />`). The hook subscribes to a single in-module state store.
 */

import { useEffect, useState } from "react";
import { Dialog, DialogContent, Button } from "./ui";

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type PendingState =
  | { open: false }
  | { open: true; opts: ConfirmOptions; resolve: (v: boolean) => void };

// Single module-level subscriber — there's at most one confirm dialog open
// at a time. If a second call comes in while one is open, we resolve the
// first as `false` (treating it as cancelled) and replace it.
let state: PendingState = { open: false };
const listeners = new Set<(s: PendingState) => void>();
function setState(next: PendingState) {
  state = next;
  for (const fn of listeners) fn(state);
}

export function confirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    if (state.open) state.resolve(false); // bump any previous prompt
    setState({ open: true, opts, resolve });
  });
}

export function ConfirmDialogHost() {
  const [s, setS] = useState<PendingState>(state);
  useEffect(() => {
    listeners.add(setS);
    return () => { listeners.delete(setS); };
  }, []);

  if (!s.open) return null;

  const opts = s.opts;
  const close = (result: boolean) => {
    s.resolve(result);
    setState({ open: false });
  };

  return (
    <Dialog open={true} onOpenChange={(o) => !o && close(false)}>
      <DialogContent
        size="sm"
        title={opts.title}
        description={opts.description}
      >
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="ghost" onClick={() => close(false)} autoFocus>
            {opts.cancelLabel ?? "Cancel"}
          </Button>
          <Button
            variant={opts.destructive ? "destructive" : "primary"}
            onClick={() => close(true)}
          >
            {opts.confirmLabel ?? "OK"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
