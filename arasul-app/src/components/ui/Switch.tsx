/**
 * Switch — toggle control (on/off).
 *
 * Radix-based. Use for binary settings ("auto-launch on mount", "show
 * hidden files"). For mutually-exclusive choices among 2+ options, use
 * RadioGroup; for opt-in lists, use Checkbox.
 *
 * Phase 1.5 Tier 3 (2026-05-11). Replaces the custom `.arasul-toggle-row`
 * in Settings.
 *
 * Usage:
 * ```tsx
 * <FormField label="Open automatically on drive mount">
 *   {(props) => <Switch checked={autoLaunch} onCheckedChange={setAutoLaunch} {...props} />}
 * </FormField>
 * ```
 */

import { forwardRef } from "react";
import * as Radix from "@radix-ui/react-switch";
import { cn } from "../../lib/cn";

export interface SwitchProps
  extends React.ComponentPropsWithoutRef<typeof Radix.Root> {
  size?: "sm" | "md";
}

const sizeClasses: Record<NonNullable<SwitchProps["size"]>, string> = {
  sm: "h-4 w-7 [&_[data-thumb]]:size-3 [&_[data-state=checked]_[data-thumb]]:translate-x-3",
  md: "h-5 w-9 [&_[data-thumb]]:size-4 [&_[data-state=checked]_[data-thumb]]:translate-x-4",
};

export const Switch = forwardRef<
  React.ElementRef<typeof Radix.Root>,
  SwitchProps
>(({ className, size = "md", ...props }, ref) => (
  <Radix.Root
    ref={ref}
    className={cn(
      "peer relative inline-flex items-center shrink-0 cursor-pointer",
      "rounded-pill border-2 border-transparent",
      "transition-colors",
      "outline-none focus-visible:[box-shadow:var(--focus-ring)]",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "data-[state=unchecked]:bg-[color:var(--border-strong)]",
      "data-[state=checked]:bg-accent",
      sizeClasses[size],
      className,
    )}
    {...props}
  >
    <Radix.Thumb
      data-thumb
      className={cn(
        "pointer-events-none block",
        "rounded-pill bg-white shadow-elev-1",
        "ring-0 transition-transform",
        "data-[state=unchecked]:translate-x-0",
      )}
    />
  </Radix.Root>
));
Switch.displayName = "Switch";
