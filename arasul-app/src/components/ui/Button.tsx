/**
 * Button — primitive used across Arasul.
 *
 * Variants:
 *   - primary       (accent fill)
 *   - secondary     (outlined, neutral)
 *   - ghost         (no background until hover; tightest visual weight)
 *   - destructive   (danger fill)
 *   - link          (underline-on-hover; no padding box)
 *
 * Sizes:
 *   - sm  (28px tall, dense toolbars)
 *   - md  (32px tall, default)
 *   - lg  (40px tall, dialog actions, onboarding CTAs)
 *
 * Phase 1.5 — first member of the `components/ui/` design-system layer.
 * Tokens come from `theme.css`; utility classes come from Tailwind v4's
 * `@theme` block.
 *
 * Loading: pass `loading={true}` to disable + render a subtle spinner.
 * `asChild`: render as a different element (e.g. `<a>`) via Radix Slot.
 */

import { forwardRef } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "../../lib/cn";

const buttonVariants = cva(
  // Base — every button gets this regardless of variant/size.
  // focus-visible uses our --focus-ring (defined in theme.css).
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "font-medium select-none",
    "transition-colors transition-shadow",
    "outline-none focus-visible:[box-shadow:var(--focus-ring)]",
    "disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
  ],
  {
    variants: {
      variant: {
        primary: [
          "bg-accent text-accent-fg",
          "hover:bg-accent-hover active:bg-accent-active",
        ],
        secondary: [
          "bg-elevated text-fg border border-border-strong",
          "hover:bg-overlay",
        ],
        ghost: [
          "bg-transparent text-fg",
          "hover:bg-overlay",
        ],
        destructive: [
          "bg-danger text-danger-fg",
          "hover:bg-[color:var(--danger-hover)]",
        ],
        link: [
          "bg-transparent text-accent",
          "hover:underline underline-offset-2",
          "px-0 h-auto",
        ],
      },
      size: {
        sm: "h-7 px-3 text-[length:var(--text-body-sm)] rounded-md",
        md: "h-8 px-4 text-[length:var(--text-body)] rounded-md",
        lg: "h-10 px-5 text-[length:var(--text-body-lg)] rounded-lg",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

type ButtonElementProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

export interface ButtonProps
  extends ButtonElementProps,
    VariantProps<typeof buttonVariants> {
  /** Render as a child component (e.g. `<a>`) via Radix Slot. */
  asChild?: boolean;
  /** Show a spinner and disable the button. */
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild = false, loading = false, disabled, children, ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            <span>{children}</span>
          </>
        ) : (
          children
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
