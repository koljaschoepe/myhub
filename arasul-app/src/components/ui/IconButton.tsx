/**
 * IconButton — icon-only button with built-in Tooltip.
 *
 * Use for toolbar buttons, header actions, tree-row controls — any
 * pixel-tight surface where text labels don't fit. Requires `label` for
 * accessibility (becomes both `aria-label` and `Tooltip` content).
 *
 * Hit-area: 24×24 minimum at size="sm", 32×32 at "md", 40×40 at "lg",
 * satisfying WCAG 2.5.8 (Target Size, AA, new in 2.2). The visible icon
 * stays small; padding fills the touch target.
 *
 * Phase 1.5 (2026-05-11). Replaces the 5+ ad-hoc `<button>{<Icon />}</button>`
 * patterns scattered across the app (component-audit finding C2/C7 — icon
 * sizes ranged 11→28px with no system).
 *
 * Example:
 * ```tsx
 * <IconButton label="Save" onClick={save}>
 *   <Save />
 * </IconButton>
 * ```
 */

import { forwardRef, type ReactNode } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";
import { Tooltip } from "./Tooltip";

const iconButtonVariants = cva(
  [
    "inline-flex items-center justify-center shrink-0",
    "transition-colors transition-shadow",
    "outline-none focus-visible:[box-shadow:var(--focus-ring)]",
    "disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
    "[&_svg]:shrink-0 [&_svg]:pointer-events-none",
  ],
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-fg hover:bg-accent-hover active:bg-accent-active",
        ghost: "bg-transparent text-fg hover:bg-overlay",
        outline:
          "bg-transparent text-fg border border-border-strong hover:bg-overlay",
        destructive:
          "bg-transparent text-danger hover:bg-[color:var(--danger-soft)]",
      },
      size: {
        // 24px hit target = WCAG 2.5.8 minimum. Icon is 14px (--icon-md).
        sm: "size-6 rounded-md [&_svg]:size-[14px]",
        // 32px hit target. Icon is 16px (--icon-lg).
        md: "size-8 rounded-md [&_svg]:size-[16px]",
        // 40px hit target. Icon is 20px (--icon-xl).
        lg: "size-10 rounded-lg [&_svg]:size-[20px]",
      },
    },
    defaultVariants: {
      variant: "ghost",
      size: "md",
    },
  },
);

type ButtonElementProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label" | "children"
>;

export interface IconButtonProps
  extends ButtonElementProps,
    VariantProps<typeof iconButtonVariants> {
  /** Accessible label — sets aria-label AND Tooltip content. Required. */
  label: string;
  /** Side for the tooltip. Default: "top". */
  tooltipSide?: "top" | "right" | "bottom" | "left";
  /** Set to false to suppress the tooltip (still keeps aria-label). */
  showTooltip?: boolean;
  /** The icon (e.g. `<Save />`). Use one of lucide-react's icons. */
  children: ReactNode;
  /** Render as a child component via Radix Slot. */
  asChild?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      className,
      variant,
      size,
      label,
      tooltipSide = "top",
      showTooltip = true,
      asChild = false,
      children,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    const button = (
      <Comp
        ref={ref}
        type="button"
        aria-label={label}
        className={cn(iconButtonVariants({ variant, size }), className)}
        {...props}
      >
        {children}
      </Comp>
    );
    if (!showTooltip) return button;
    return (
      <Tooltip content={label} side={tooltipSide}>
        {button}
      </Tooltip>
    );
  },
);
IconButton.displayName = "IconButton";

export { iconButtonVariants };
