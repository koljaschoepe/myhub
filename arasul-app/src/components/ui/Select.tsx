/**
 * Select — Radix-powered dropdown selector.
 *
 * Native `<select>` is impossible to style consistently across macOS/
 * Windows/Linux WebKit/Chromium. Radix Select gives full styling control
 * plus better-than-native keyboard nav, type-ahead, search, and ARIA.
 *
 * Phase 1.5 Tier 3 (2026-05-11). Replaces native `<select>` in Settings
 * (theme picker, density picker, auto-lock minutes, default shell),
 * Onboarding (language picker), and ProviderPicker (model picker).
 *
 * Usage:
 * ```tsx
 * <Select value={theme} onValueChange={setTheme}>
 *   <SelectTrigger placeholder="Pick a theme" />
 *   <SelectContent>
 *     <SelectItem value="light">Light</SelectItem>
 *     <SelectItem value="dark">Dark</SelectItem>
 *     <SelectSeparator />
 *     <SelectItem value="system">Match system</SelectItem>
 *   </SelectContent>
 * </Select>
 * ```
 *
 * For groups: `SelectGroup` + `SelectLabel`. For long lists, Radix Select
 * provides virtualized rendering for free.
 */

import { forwardRef, type ReactNode } from "react";
import * as Radix from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "../../lib/cn";

export const Select = Radix.Root;
export const SelectGroup = Radix.Group;
export const SelectValue = Radix.Value;

export interface SelectTriggerProps
  extends Omit<React.ComponentPropsWithoutRef<typeof Radix.Trigger>, "children"> {
  /** Placeholder when no value is selected. */
  placeholder?: ReactNode;
  /** Optional custom children — overrides the default Value rendering. */
  children?: ReactNode;
  /** Size token. */
  size?: "sm" | "md" | "lg";
}

const triggerSize: Record<NonNullable<SelectTriggerProps["size"]>, string> = {
  sm: "h-7 px-2.5 rounded-md text-[length:var(--text-body-sm)]",
  md: "h-8 px-3 rounded-md text-[length:var(--text-body)]",
  lg: "h-10 px-3.5 rounded-lg text-[length:var(--text-body-lg)]",
};

export const SelectTrigger = forwardRef<
  React.ElementRef<typeof Radix.Trigger>,
  SelectTriggerProps
>(({ className, placeholder, children, size = "md", ...props }, ref) => (
  <Radix.Trigger
    ref={ref}
    className={cn(
      "inline-flex w-full items-center justify-between gap-2",
      triggerSize[size],
      "bg-[color:var(--bg-elevated)] text-fg",
      "border border-[color:var(--border-default)]",
      "outline-none transition-colors transition-shadow",
      "hover:border-[color:var(--border-strong)]",
      "focus:[box-shadow:var(--focus-ring)] focus:border-[color:var(--border-strong)]",
      "data-[state=open]:border-[color:var(--border-strong)]",
      "data-[placeholder]:text-fg-muted",
      "disabled:opacity-50 disabled:cursor-not-allowed",
      "[&>span]:line-clamp-1",
      className,
    )}
    {...props}
  >
    {children ?? <Radix.Value placeholder={placeholder} />}
    <Radix.Icon asChild>
      <ChevronDown
        className="size-[14px] text-fg-muted shrink-0 opacity-80"
        aria-hidden="true"
      />
    </Radix.Icon>
  </Radix.Trigger>
));
SelectTrigger.displayName = "SelectTrigger";

export const SelectContent = forwardRef<
  React.ElementRef<typeof Radix.Content>,
  React.ComponentPropsWithoutRef<typeof Radix.Content>
>(({ className, children, position = "popper", sideOffset = 4, ...props }, ref) => (
  <Radix.Portal>
    <Radix.Content
      ref={ref}
      position={position}
      sideOffset={sideOffset}
      className={cn(
        "z-(--z-modal-critical)",
        "relative min-w-[var(--radix-select-trigger-width)] max-h-[--radix-select-content-available-height]",
        "overflow-hidden",
        "bg-[color:var(--bg-elevated)] text-fg",
        "border border-[color:var(--border-strong)]",
        "rounded-md shadow-elev-3",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        "data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95",
        position === "popper" && [
          "data-[side=bottom]:translate-y-1",
          "data-[side=top]:-translate-y-1",
        ],
        className,
      )}
      {...props}
    >
      <Radix.ScrollUpButton className="flex items-center justify-center h-6 cursor-default">
        <ChevronUp className="size-[14px] text-fg-muted" aria-hidden="true" />
      </Radix.ScrollUpButton>
      <Radix.Viewport
        className={cn(
          "p-1",
          position === "popper" &&
            "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]",
        )}
      >
        {children}
      </Radix.Viewport>
      <Radix.ScrollDownButton className="flex items-center justify-center h-6 cursor-default">
        <ChevronDown className="size-[14px] text-fg-muted" aria-hidden="true" />
      </Radix.ScrollDownButton>
    </Radix.Content>
  </Radix.Portal>
));
SelectContent.displayName = "SelectContent";

export const SelectLabel = forwardRef<
  React.ElementRef<typeof Radix.Label>,
  React.ComponentPropsWithoutRef<typeof Radix.Label>
>(({ className, ...props }, ref) => (
  <Radix.Label
    ref={ref}
    className={cn(
      "px-2 py-1.5 text-[length:var(--text-caption)] font-medium text-fg-muted uppercase tracking-wide",
      className,
    )}
    {...props}
  />
));
SelectLabel.displayName = "SelectLabel";

export const SelectItem = forwardRef<
  React.ElementRef<typeof Radix.Item>,
  React.ComponentPropsWithoutRef<typeof Radix.Item>
>(({ className, children, ...props }, ref) => (
  <Radix.Item
    ref={ref}
    className={cn(
      "relative flex w-full select-none items-center gap-2",
      "pl-7 pr-2 py-1.5 rounded-sm",
      "text-[length:var(--text-body-sm)] text-fg",
      "cursor-default outline-none",
      "focus:bg-accent focus:text-accent-fg",
      "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className,
    )}
    {...props}
  >
    <span className="absolute left-2 flex size-3.5 items-center justify-center">
      <Radix.ItemIndicator>
        <Check className="size-[14px]" aria-hidden="true" />
      </Radix.ItemIndicator>
    </span>
    <Radix.ItemText>{children}</Radix.ItemText>
  </Radix.Item>
));
SelectItem.displayName = "SelectItem";

export const SelectSeparator = forwardRef<
  React.ElementRef<typeof Radix.Separator>,
  React.ComponentPropsWithoutRef<typeof Radix.Separator>
>(({ className, ...props }, ref) => (
  <Radix.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-[color:var(--border-subtle)]", className)}
    {...props}
  />
));
SelectSeparator.displayName = "SelectSeparator";
