/**
 * Thin wrapper over Sonner so we have one place to evolve the
 * notification UX (defaults, error formatting, action shape).
 *
 * All silent `.catch(() => {})` sites in the codebase should be replaced
 * with `notify.err("…", e)` so the user actually sees what failed.
 */
import { toast } from "sonner";
import { describeError, errorMessage } from "./errors";

const COPY_LABEL = "Copy details";

export const notify = {
  /** Quick success: 2.5s auto-dismiss. */
  ok(text: string, description?: string) {
    toast.success(text, { description, duration: 2500 });
  },

  /** Error toast with a "Copy details" action. Stays open until dismissed. */
  err(fallbackTitle: string, e?: unknown) {
    if (e === undefined) {
      toast.error(fallbackTitle, { duration: Infinity });
      return;
    }
    const friendly = describeError(e);
    const title = friendly.title || fallbackTitle;
    const description = friendly.description ?? errorMessage(e);
    toast.error(title, {
      description,
      duration: Infinity,
      action: {
        label: COPY_LABEL,
        onClick: () => {
          try {
            void navigator.clipboard.writeText(`${title}\n${description}\n${String(e)}`);
          } catch { /* ignore */ }
        },
      },
    });
  },

  /** Long-running op: returns the toast id so you can resolve it. */
  loading(text: string): string | number {
    return toast.loading(text);
  },

  /** Resolve a loading toast to success. */
  resolve(id: string | number, text: string) {
    toast.success(text, { id, duration: 2500 });
  },

  /** Resolve a loading toast to error. */
  reject(id: string | number, fallbackTitle: string, e?: unknown) {
    toast.dismiss(id);
    this.err(fallbackTitle, e);
  },

  /** Plain neutral toast (Linear-style for "Action ↵ Undo"). */
  info(text: string, opts?: { action?: { label: string; onClick: () => void }; duration?: number }) {
    toast(text, { duration: opts?.duration ?? 5000, action: opts?.action });
  },
};
