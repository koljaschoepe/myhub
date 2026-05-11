/**
 * RadioGroup — mutually-exclusive choice among 2+ options.
 *
 * Radix-based. Use for theme picker (light/dark/system), density picker
 * (compact/normal/spacious), or any "pick one" setting. For binary toggles,
 * use Switch instead.
 *
 * Phase 1.5 Tier 3 (2026-05-11). Replaces custom `.arasul-theme-opt` and
 * `.arasul-density-opt` patterns in Settings.
 *
 * Usage:
 * ```tsx
 * <RadioGroup value={theme} onValueChange={setTheme} className="flex flex-col gap-2">
 *   <label className="inline-flex items-center gap-2">
 *     <RadioGroupItem value="light" /><span>Light</span>
 *   </label>
 *   <label className="inline-flex items-center gap-2">
 *     <RadioGroupItem value="dark" /><span>Dark</span>
 *   </label>
 *   <label className="inline-flex items-center gap-2">
 *     <RadioGroupItem value="system" /><span>Match system</span>
 *   </label>
 * </RadioGroup>
 * ```
 *
 * For a card-style picker (e.g. theme preview tiles), wrap RadioGroupItem
 * in a labeled card and use `data-[state=checked]` for the active style.
 */

import { forwardRef } from "react";
import * as Radix from "@radix-ui/react-radio-group";
import { cn } from "../../lib/cn";

export const RadioGroup = forwardRef<
  React.ElementRef<typeof Radix.Root>,
  React.ComponentPropsWithoutRef<typeof Radix.Root>
>(({ className, ...props }, ref) => (
  <Radix.Root ref={ref} className={cn("grid gap-2", className)} {...props} />
));
RadioGroup.displayName = "RadioGroup";

export const RadioGroupItem = forwardRef<
  React.ElementRef<typeof Radix.Item>,
  React.ComponentPropsWithoutRef<typeof Radix.Item>
>(({ className, ...props }, ref) => (
  <Radix.Item
    ref={ref}
    className={cn(
      "aspect-square size-4 shrink-0 inline-flex items-center justify-center",
      "rounded-full border",
      "border-[color:var(--border-strong)] text-accent",
      "transition-colors",
      "outline-none focus-visible:[box-shadow:var(--focus-ring)]",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "data-[state=checked]:border-accent",
      className,
    )}
    {...props}
  >
    <Radix.Indicator className="flex items-center justify-center">
      <span className="block size-2 rounded-full bg-accent" />
    </Radix.Indicator>
  </Radix.Item>
));
RadioGroupItem.displayName = "RadioGroupItem";
