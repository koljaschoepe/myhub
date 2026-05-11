/**
 * Checkbox — multi-select boolean.
 *
 * Radix-based. Use for opt-in lists, "remember me", "show hidden files",
 * filter toggles. Default size matches our 14px icon hit-target.
 *
 * Phase 1.5 Tier 3 (2026-05-11).
 *
 * Indeterminate state supported via `checked="indeterminate"` (partial
 * check, useful for "select all" parent rows).
 *
 * Usage:
 * ```tsx
 * <label className="inline-flex items-center gap-2">
 *   <Checkbox checked={agree} onCheckedChange={setAgree} />
 *   <span>I agree to the terms</span>
 * </label>
 * ```
 */

import { forwardRef } from "react";
import * as Radix from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";
import { cn } from "../../lib/cn";

export interface CheckboxProps
  extends React.ComponentPropsWithoutRef<typeof Radix.Root> {
  size?: "sm" | "md";
}

const sizeClasses: Record<NonNullable<CheckboxProps["size"]>, string> = {
  sm: "size-3.5 [&_svg]:size-3",
  md: "size-4 [&_svg]:size-3.5",
};

export const Checkbox = forwardRef<
  React.ElementRef<typeof Radix.Root>,
  CheckboxProps
>(({ className, size = "md", ...props }, ref) => (
  <Radix.Root
    ref={ref}
    className={cn(
      "peer shrink-0 inline-flex items-center justify-center",
      "rounded-[4px] border",
      "border-[color:var(--border-strong)]",
      "bg-[color:var(--bg-elevated)]",
      "transition-colors",
      "outline-none focus-visible:[box-shadow:var(--focus-ring)]",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "data-[state=checked]:bg-accent data-[state=checked]:border-accent data-[state=checked]:text-accent-fg",
      "data-[state=indeterminate]:bg-accent data-[state=indeterminate]:border-accent data-[state=indeterminate]:text-accent-fg",
      sizeClasses[size],
      className,
    )}
    {...props}
  >
    <Radix.Indicator className="flex items-center justify-center text-current">
      {props.checked === "indeterminate" ? (
        <Minus strokeWidth={3} aria-hidden="true" />
      ) : (
        <Check strokeWidth={3} aria-hidden="true" />
      )}
    </Radix.Indicator>
  </Radix.Root>
));
Checkbox.displayName = "Checkbox";
