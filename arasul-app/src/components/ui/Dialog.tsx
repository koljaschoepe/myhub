/**
 * Dialog — Radix-based modal primitive.
 *
 * Replaces the four ad-hoc modal patterns the audit found in the codebase
 * (`.arasul-modal*` / `.arasul-cmdk-overlay` / `.arasul-settings-overlay` /
 *  inline `role="dialog"` for ShortcutsOverlay) with a single, consistent
 * surface. Radix gives us focus trap + restore, Escape, `aria-modal`,
 * `role="dialog"`, `aria-labelledby` + `aria-describedby` wiring,
 * scroll-lock — all for free.
 *
 * Phase 1.5 (2026-05-11).
 *
 * Default backdrop dim and elevation token are sourced from theme.css.
 * z-index is `--z-modal-default`; for higher tiers, pass a `className`
 * on `DialogOverlay` with `style={{ zIndex: 'var(--z-modal-important)' }}`.
 *
 * Usage (controlled):
 * ```tsx
 * const [open, setOpen] = useState(false);
 * <Dialog open={open} onOpenChange={setOpen}>
 *   <DialogContent title="Confirm delete" description="This can't be undone.">
 *     <p>Are you sure?</p>
 *     <DialogFooter>
 *       <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
 *       <Button variant="destructive" onClick={handleDelete}>Delete</Button>
 *     </DialogFooter>
 *   </DialogContent>
 * </Dialog>
 * ```
 *
 * For a custom title (e.g. branded mark), pass `titleSlot` and omit `title`.
 */

import { forwardRef, type ReactNode } from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "../../lib/cn";
import { IconButton } from "./IconButton";

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogPortal = RadixDialog.Portal;
export const DialogClose = RadixDialog.Close;

export const DialogOverlay = forwardRef<
  HTMLDivElement,
  RadixDialog.DialogOverlayProps
>(({ className, ...props }, ref) => (
  <RadixDialog.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-(--z-modal-default)",
      "bg-[color:var(--backdrop)]",
      "data-[state=open]:animate-in data-[state=closed]:animate-out",
      "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = "DialogOverlay";

export interface DialogContentProps
  extends Omit<RadixDialog.DialogContentProps, "title"> {
  /** Visible header title. Pass `null` (or use `titleSlot`) to omit. */
  title?: ReactNode;
  /** Visually-hidden but screen-reader-readable description. */
  description?: ReactNode;
  /** Replace the default `<h2>` title with a custom node (e.g. branded mark). */
  titleSlot?: ReactNode;
  /** Hide the top-right Close button. */
  hideCloseButton?: boolean;
  /** Max-width preset. */
  size?: "sm" | "md" | "lg" | "xl";
}

const sizeClass: Record<NonNullable<DialogContentProps["size"]>, string> = {
  sm: "w-[min(360px,92vw)]",
  md: "w-[min(480px,92vw)]",
  lg: "w-[min(640px,92vw)]",
  xl: "w-[min(880px,92vw)]",
};

export const DialogContent = forwardRef<HTMLDivElement, DialogContentProps>(
  (
    {
      className,
      title,
      description,
      titleSlot,
      hideCloseButton = false,
      size = "md",
      children,
      ...props
    },
    ref,
  ) => (
    <DialogPortal>
      <DialogOverlay />
      <RadixDialog.Content
        ref={ref}
        className={cn(
          "fixed left-1/2 top-1/2 z-(--z-modal-default)",
          "-translate-x-1/2 -translate-y-1/2",
          sizeClass[size],
          "max-h-[90vh] flex flex-col",
          "bg-[color:var(--bg-elevated)] text-fg",
          "border border-[color:var(--border-strong)]",
          "rounded-xl shadow-elev-4",
          "p-6 gap-4",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          "data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95",
          className,
        )}
        {...props}
      >
        {(title || titleSlot || description) && (
          <div className="flex flex-col gap-1">
            {titleSlot ?? (title && (
              <RadixDialog.Title className="text-[length:var(--text-h3)] font-semibold leading-tight">
                {title}
              </RadixDialog.Title>
            ))}
            {description && (
              <RadixDialog.Description className="text-[length:var(--text-body-sm)] text-fg-muted">
                {description}
              </RadixDialog.Description>
            )}
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-auto">{children}</div>

        {!hideCloseButton && (
          <RadixDialog.Close asChild>
            <IconButton
              label="Close"
              variant="ghost"
              size="sm"
              showTooltip={false}
              className="absolute right-3 top-3"
            >
              <X />
            </IconButton>
          </RadixDialog.Close>
        )}
      </RadixDialog.Content>
    </DialogPortal>
  ),
);
DialogContent.displayName = "DialogContent";

export function DialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex flex-col gap-1.5 text-left", className)} {...props} />
  );
}

export function DialogFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2",
        className,
      )}
      {...props}
    />
  );
}

export const DialogTitle = RadixDialog.Title;
export const DialogDescription = RadixDialog.Description;
