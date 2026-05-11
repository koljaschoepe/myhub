/**
 * FormField — label + control + description + error wrapper.
 *
 * Phase 1.5 Tier 2 (2026-05-11). Replaces the triplicated label-input
 * scaffolding in Onboarding.css / Settings.css / LeftPane.css (component-
 * audit finding C8 — forms lack structure, manual onChange tracking, no
 * `<form>` element).
 *
 * What it does:
 *   - Generates a unique `id` via React's `useId()` so label/control link.
 *   - Wires `htmlFor` on the label automatically.
 *   - On error, sets `aria-invalid="true"` and `aria-describedby` on the
 *     control so screen readers announce the message.
 *   - Description text is rendered between label and control (or
 *     below — pass `descriptionPosition="below"`).
 *
 * The control is rendered via render-prop `children(props)` so it can
 * inject the auto-generated `id` and aria-* attributes onto whatever
 * element (input, textarea, custom component) is used.
 *
 * Example:
 * ```tsx
 * <FormField
 *   label="Your name"
 *   description="We'll use this to personalize your workspace."
 *   error={errors.name}
 *   required
 * >
 *   {(props) => (
 *     <input
 *       type="text"
 *       value={name}
 *       onChange={(e) => setName(e.target.value)}
 *       {...props}
 *     />
 *   )}
 * </FormField>
 * ```
 */

import { useId, type ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface FormFieldRenderProps {
  id: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  "aria-required"?: boolean;
}

export interface FormFieldProps {
  /** Visible label text above the control. */
  label: ReactNode;
  /** Optional helper text. */
  description?: ReactNode;
  /** Where description renders. Default "above" (between label and control). */
  descriptionPosition?: "above" | "below";
  /** Error message (string or React node). Sets aria-invalid + describedby. */
  error?: ReactNode;
  /** Marks the field required. Renders a subtle "*" after the label. */
  required?: boolean;
  /** Render-prop receiving auto-generated id + aria attrs. */
  children: (props: FormFieldRenderProps) => ReactNode;
  /** Extra class on the wrapper `<div>`. */
  className?: string;
}

export function FormField({
  label,
  description,
  descriptionPosition = "above",
  error,
  required,
  children,
  className,
}: FormFieldProps) {
  const reactId = useId();
  const controlId = `field-${reactId}`;
  const descId = description ? `${controlId}-desc` : undefined;
  const errId = error ? `${controlId}-err` : undefined;
  const describedBy = [descId, errId].filter(Boolean).join(" ") || undefined;

  const controlProps: FormFieldRenderProps = {
    id: controlId,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
    "aria-required": required || undefined,
  };

  const descriptionNode = description ? (
    <p
      id={descId}
      className="text-[length:var(--text-body-sm)] text-fg-muted leading-[1.5]"
    >
      {description}
    </p>
  ) : null;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label
        htmlFor={controlId}
        className="flex items-center gap-1 text-[length:var(--text-body-sm)] font-medium text-fg"
      >
        {label}
        {required && (
          <span
            aria-hidden="true"
            className="text-danger"
            title="Required field"
          >
            *
          </span>
        )}
      </label>

      {descriptionPosition === "above" && descriptionNode}

      {children(controlProps)}

      {descriptionPosition === "below" && descriptionNode}

      {error && (
        <p
          id={errId}
          role="alert"
          className="text-[length:var(--text-body-sm)] text-danger leading-[1.5]"
        >
          {error}
        </p>
      )}
    </div>
  );
}
