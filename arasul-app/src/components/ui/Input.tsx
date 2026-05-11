/**
 * Input — text-like form control.
 *
 * Wraps a native `<input>` with our token-based styling so Onboarding,
 * Settings, LeftPane, and the search panel can stop carrying their own
 * duplicate `input { … }` CSS (component-audit finding C4 — three near-
 * identical rulesets across files).
 *
 * Supports any input type the native element does (text/email/password/
 * search/url/tel/number/date/etc.). Pair with FormField for label + error
 * + description wiring.
 *
 * Optional slots:
 *   - `leading`  — icon or text rendered on the left (search magnifier)
 *   - `trailing` — icon or text rendered on the right (clear button)
 *
 * Phase 1.5 Tier 3 (2026-05-11).
 *
 * Usage:
 * ```tsx
 * <Input type="email" placeholder="you@arasul.app" />
 *
 * <Input
 *   leading={<Search size={14} />}
 *   placeholder="Search..."
 *   value={query}
 *   onChange={(e) => setQuery(e.target.value)}
 * />
 * ```
 */

import { forwardRef, type ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";

const inputContainerVariants = cva(
  [
    "inline-flex items-center w-full",
    "bg-[color:var(--bg-elevated)] text-fg",
    "border border-[color:var(--border-default)]",
    "transition-colors transition-shadow",
    "focus-within:border-[color:var(--border-strong)]",
    "focus-within:[box-shadow:var(--focus-ring)]",
    "has-[input:disabled]:opacity-50 has-[input:disabled]:cursor-not-allowed",
    "data-[invalid=true]:border-danger data-[invalid=true]:[--focus-ring:0_0_0_2px_var(--danger),0_0_0_4px_color-mix(in_srgb,var(--danger)_25%,transparent)]",
  ],
  {
    variants: {
      size: {
        sm: "h-7 px-2.5 rounded-md text-[length:var(--text-body-sm)] gap-1.5",
        md: "h-8 px-3 rounded-md text-[length:var(--text-body)] gap-2",
        lg: "h-10 px-3.5 rounded-lg text-[length:var(--text-body-lg)] gap-2",
      },
    },
    defaultVariants: { size: "md" },
  },
);

type NativeInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "size"
>;

export interface InputProps
  extends NativeInputProps,
    VariantProps<typeof inputContainerVariants> {
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Marks the field invalid (sets aria-invalid + danger ring). Usually
   *  set automatically when the parent FormField has an `error`. */
  invalid?: boolean;
  /** Extra class on the visible container (border, sizing). */
  containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      containerClassName,
      size,
      leading,
      trailing,
      invalid,
      "aria-invalid": ariaInvalid,
      ...props
    },
    ref,
  ) => {
    const isInvalid = invalid ?? (ariaInvalid === true || ariaInvalid === "true");
    return (
      <div
        data-invalid={isInvalid || undefined}
        className={cn(inputContainerVariants({ size }), containerClassName)}
      >
        {leading && (
          <span className="text-fg-muted shrink-0 [&_svg]:size-[14px] [&_svg]:shrink-0">
            {leading}
          </span>
        )}
        <input
          ref={ref}
          aria-invalid={isInvalid || undefined}
          className={cn(
            "flex-1 min-w-0 bg-transparent outline-none",
            "placeholder:text-fg-muted",
            "disabled:cursor-not-allowed",
            className,
          )}
          {...props}
        />
        {trailing && (
          <span className="text-fg-muted shrink-0 [&_svg]:size-[14px] [&_svg]:shrink-0">
            {trailing}
          </span>
        )}
      </div>
    );
  },
);
Input.displayName = "Input";

export { inputContainerVariants };
