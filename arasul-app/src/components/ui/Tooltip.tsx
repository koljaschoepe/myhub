/**
 * Tooltip — Radix wrapper with Arasul's default styling.
 *
 * Built on `@radix-ui/react-tooltip` (ARIA-compliant: role, aria-describedby,
 * focus + pointer triggers, escape to dismiss). Adds:
 *   - 1.5s default open delay (Linear's number)
 *   - Subtle elevation token (--elev-3)
 *   - Honors `prefers-reduced-motion`
 *
 * Usage:
 * ```tsx
 * <Tooltip content="Open settings">
 *   <IconButton><Settings /></IconButton>
 * </Tooltip>
 * ```
 *
 * For a custom delay or side, drop down to Radix primitives:
 * ```tsx
 * <Tooltip.Provider>
 *   <Tooltip.Root delayDuration={300}>
 *     <Tooltip.Trigger asChild>{...}</Tooltip.Trigger>
 *     <Tooltip.Content side="left">{...}</Tooltip.Content>
 *   </Tooltip.Root>
 * </Tooltip.Provider>
 * ```
 *
 * Phase 1.5 (2026-05-11). Audit findings: app shipped ZERO tooltips before
 * this primitive (component-audit Finding A4); icon-only buttons relied on
 * native `title=""` which screen readers don't announce reliably.
 */

import { forwardRef, type ReactNode } from "react";
import * as RadixTooltip from "@radix-ui/react-tooltip";
import { cn } from "../../lib/cn";

const DEFAULT_OPEN_DELAY = 1500;

/**
 * Mount this once near the app root so all Tooltip.Root instances share
 * a delay/skip state. Already added in main.tsx; you rarely need to nest.
 */
export const TooltipProvider = RadixTooltip.Provider;

/** Re-export primitives for advanced use. */
export const TooltipRoot = RadixTooltip.Root;
export const TooltipTrigger = RadixTooltip.Trigger;
export const TooltipPortal = RadixTooltip.Portal;
export const TooltipArrow = RadixTooltip.Arrow;

export const TooltipContent = forwardRef<
  HTMLDivElement,
  RadixTooltip.TooltipContentProps
>(({ className, sideOffset = 6, children, ...props }, ref) => (
  <RadixTooltip.Portal>
    <RadixTooltip.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-(--z-modal-critical)",
        "px-2 py-1 rounded-md",
        "bg-[color:var(--bg-elevated)] text-fg",
        "text-[length:var(--text-body-sm)]",
        "border border-[color:var(--border-strong)]",
        "shadow-elev-3",
        "data-[state=delayed-open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=delayed-open]:fade-in-0",
        "data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1",
        "data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1",
        className,
      )}
      {...props}
    >
      {children}
    </RadixTooltip.Content>
  </RadixTooltip.Portal>
));
TooltipContent.displayName = "TooltipContent";

/**
 * Convenience wrapper for the 90% case: trigger element + string content.
 * Use the raw `TooltipRoot`/`TooltipTrigger`/`TooltipContent` for full control.
 */
export function Tooltip({
  children,
  content,
  side = "top",
  delayDuration = DEFAULT_OPEN_DELAY,
}: {
  children: ReactNode;
  content: ReactNode;
  side?: RadixTooltip.TooltipContentProps["side"];
  delayDuration?: number;
}) {
  // If content is empty or only whitespace, skip the wrapper entirely so
  // we don't paint an empty tooltip.
  const hasContent =
    typeof content === "string" ? content.trim().length > 0 : content != null;
  if (!hasContent) return <>{children}</>;
  return (
    <RadixTooltip.Root delayDuration={delayDuration}>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <TooltipContent side={side}>{content}</TooltipContent>
    </RadixTooltip.Root>
  );
}
