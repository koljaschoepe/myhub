import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind classes intelligently.
 *
 * Combines `clsx` (conditional class composition) with `tailwind-merge`
 * (deduplicates conflicting Tailwind utilities — `px-2 px-4` → `px-4`).
 *
 * Used by every primitive in `components/ui/` to compose variant classes
 * with caller overrides:
 *
 * ```tsx
 * <button className={cn(buttonVariants({ variant, size }), className)} />
 * ```
 *
 * Reference: the standard shadcn/ui helper.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
