/**
 * Badge — status / category pill.
 *
 * Phase 1.5 Tier 2 (2026-05-11). Replaces:
 *   - `.arasul-pp-badge` (ProviderPicker, 5 ad-hoc color variants)
 *   - `.arasul-status-pill` (Settings)
 *   - `.arasul-theme-opt.active` (theme picker)
 *
 * Tones:
 *   - neutral   — fg on bg-overlay (default; "category" / "version")
 *   - accent    — accent-soft / accent-fg ("active", "selected")
 *   - success   — success-soft / success ("ok", "connected", "saved")
 *   - warning   — warning soft / warning ("draft", "outdated")
 *   - danger    — danger-soft / danger ("error", "failed", "offline")
 *   - info      — info-soft / info ("note", "tip")
 *
 * Variants:
 *   - soft   — colored background + matching text (default, the inviting look)
 *   - solid  — opaque fill with contrasting fg (e.g. count badges)
 *   - outline — transparent bg with colored border + text
 *
 * Example:
 * ```tsx
 * <Badge tone="success">Connected</Badge>
 * <Badge tone="warning" variant="outline">Draft</Badge>
 * <Badge tone="accent">v3.1</Badge>
 * ```
 */

import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";

const badgeVariants = cva(
  [
    "inline-flex items-center gap-1 shrink-0",
    "px-2 py-0.5 rounded-pill",
    "text-[length:var(--text-caption)] font-medium",
    "border border-transparent",
    "whitespace-nowrap select-none",
    "[&_svg]:size-[12px] [&_svg]:shrink-0",
  ],
  {
    variants: {
      tone: {
        neutral: "",
        accent: "",
        success: "",
        warning: "",
        danger: "",
        info: "",
      },
      variant: {
        soft: "",
        solid: "",
        outline: "bg-transparent",
      },
    },
    compoundVariants: [
      // soft variant (default)
      { tone: "neutral", variant: "soft", class: "bg-overlay text-fg" },
      { tone: "accent",  variant: "soft", class: "bg-accent-soft text-accent" },
      { tone: "success", variant: "soft", class: "bg-success-soft text-success" },
      { tone: "warning", variant: "soft", class: "bg-[color:var(--warning)]/20 text-warning" },
      { tone: "danger",  variant: "soft", class: "bg-danger-soft text-danger" },
      { tone: "info",    variant: "soft", class: "bg-info-soft text-info" },

      // solid variant
      { tone: "neutral", variant: "solid", class: "bg-elevated text-fg border border-border-strong" },
      { tone: "accent",  variant: "solid", class: "bg-accent text-accent-fg" },
      { tone: "success", variant: "solid", class: "bg-success text-success-fg" },
      { tone: "warning", variant: "solid", class: "bg-warning text-warning-fg" },
      { tone: "danger",  variant: "solid", class: "bg-danger text-danger-fg" },
      { tone: "info",    variant: "solid", class: "bg-info text-fg-inverse" },

      // outline variant
      { tone: "neutral", variant: "outline", class: "text-fg-muted border-border-strong" },
      { tone: "accent",  variant: "outline", class: "text-accent border-accent" },
      { tone: "success", variant: "outline", class: "text-success border-success" },
      { tone: "warning", variant: "outline", class: "text-warning border-warning" },
      { tone: "danger",  variant: "outline", class: "text-danger border-danger" },
      { tone: "info",    variant: "outline", class: "text-info border-info" },
    ],
    defaultVariants: {
      tone: "neutral",
      variant: "soft",
    },
  },
);

type BadgeElementProps = React.HTMLAttributes<HTMLSpanElement>;

export interface BadgeProps
  extends BadgeElementProps,
    VariantProps<typeof badgeVariants> {}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, tone, variant, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(badgeVariants({ tone, variant }), className)}
      {...props}
    />
  ),
);
Badge.displayName = "Badge";

export { badgeVariants };
