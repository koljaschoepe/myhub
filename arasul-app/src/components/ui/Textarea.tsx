/**
 * Textarea — multi-line text input.
 *
 * Same visual language as Input. No fixed height — `rows` prop (native)
 * + `min-h` Tailwind class on consumer side control vertical sizing.
 *
 * Phase 1.5 Tier 3 (2026-05-11).
 *
 * Pair with FormField for label/error wiring:
 * ```tsx
 * <FormField label="Bio" description="Markdown supported." error={errors.bio}>
 *   {(props) => <Textarea rows={4} value={bio} onChange={…} {...props} />}
 * </FormField>
 * ```
 */

import { forwardRef } from "react";
import { cn } from "../../lib/cn";

type NativeTextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export interface TextareaProps extends NativeTextareaProps {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid, "aria-invalid": ariaInvalid, ...props }, ref) => {
    const isInvalid = invalid ?? (ariaInvalid === true || ariaInvalid === "true");
    return (
      <textarea
        ref={ref}
        aria-invalid={isInvalid || undefined}
        data-invalid={isInvalid || undefined}
        className={cn(
          "w-full min-h-[80px] px-3 py-2",
          "bg-[color:var(--bg-elevated)] text-fg",
          "border border-[color:var(--border-default)]",
          "rounded-md",
          "text-[length:var(--text-body)] leading-[1.5]",
          "placeholder:text-fg-muted",
          "outline-none transition-colors transition-shadow",
          "focus:border-[color:var(--border-strong)]",
          "focus:[box-shadow:var(--focus-ring)]",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "resize-y",
          "data-[invalid=true]:border-danger",
          "data-[invalid=true]:focus:[box-shadow:0_0_0_2px_var(--danger),0_0_0_4px_color-mix(in_srgb,var(--danger)_25%,transparent)]",
          className,
        )}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";
