/**
 * ContextMenu — right-click triggered menu.
 *
 * Radix-based. Same visual API as DropdownMenu (identical Item/Separator/
 * Label styling) but triggered by `contextmenu` event instead of click.
 *
 * Phase 1.5 Tier 2 (2026-05-11). Slated to replace the custom
 * `components/ContextMenu.tsx` during Phase 1.9. Audit findings:
 *   - Current ContextMenu lacks keyboard nav (E1 finding).
 *   - Right-click in Settings could collide with underlying modal z-index
 *     (now fixed in 1.4 — both at --z-modal-critical with stack-order
 *     handled by Radix).
 *
 * Usage:
 * ```tsx
 * <ContextMenu>
 *   <ContextMenuTrigger asChild>
 *     <div>Right-click me</div>
 *   </ContextMenuTrigger>
 *   <ContextMenuContent>
 *     <ContextMenuItem onSelect={rename}>Rename</ContextMenuItem>
 *     <ContextMenuItem onSelect={duplicate}>Duplicate</ContextMenuItem>
 *     <ContextMenuSeparator />
 *     <ContextMenuItem destructive onSelect={remove}>Delete</ContextMenuItem>
 *   </ContextMenuContent>
 * </ContextMenu>
 * ```
 */

import { forwardRef } from "react";
import * as Radix from "@radix-ui/react-context-menu";
import { Check, ChevronRight, Circle } from "lucide-react";
import { cn } from "../../lib/cn";

export const ContextMenu = Radix.Root;
export const ContextMenuTrigger = Radix.Trigger;
export const ContextMenuGroup = Radix.Group;
export const ContextMenuPortal = Radix.Portal;
export const ContextMenuSub = Radix.Sub;
export const ContextMenuRadioGroup = Radix.RadioGroup;

/* Shared styling — kept in sync with DropdownMenu.tsx so right-click and
   click-triggered menus look identical. If you change one, change both. */

const contentClass = [
  "z-(--z-modal-critical)",
  "min-w-[200px] overflow-hidden",
  "bg-[color:var(--bg-elevated)] text-fg",
  "border border-[color:var(--border-strong)]",
  "rounded-md shadow-elev-3",
  "p-1",
  "data-[state=open]:animate-in data-[state=closed]:animate-out",
  "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
  "data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95",
] as const;

const itemClass = [
  "relative flex select-none items-center gap-2",
  "px-2 py-1.5 rounded-sm",
  "text-[length:var(--text-body-sm)] text-fg",
  "cursor-default outline-none",
  "transition-colors",
  "focus:bg-accent focus:text-accent-fg",
  "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
  "[&_svg]:size-[14px] [&_svg]:shrink-0",
] as const;

const itemDestructiveClass = [
  "text-danger focus:bg-danger focus:text-danger-fg",
] as const;

const separatorClass = "-mx-1 my-1 h-px bg-[color:var(--border-subtle)]";

const labelClass =
  "px-2 py-1.5 text-[length:var(--text-caption)] font-medium text-fg-muted uppercase tracking-wide";

const shortcutClass =
  "ml-auto pl-3 text-[length:var(--text-caption)] text-fg-muted tracking-wide";

/* Components */

export const ContextMenuSubTrigger = forwardRef<
  React.ElementRef<typeof Radix.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof Radix.SubTrigger>
>(({ className, children, ...props }, ref) => (
  <Radix.SubTrigger
    ref={ref}
    className={cn(itemClass, "data-[state=open]:bg-overlay", className)}
    {...props}
  >
    {children}
    <ChevronRight className="ml-auto" aria-hidden="true" />
  </Radix.SubTrigger>
));
ContextMenuSubTrigger.displayName = "ContextMenuSubTrigger";

export const ContextMenuSubContent = forwardRef<
  React.ElementRef<typeof Radix.SubContent>,
  React.ComponentPropsWithoutRef<typeof Radix.SubContent>
>(({ className, ...props }, ref) => (
  <Radix.SubContent ref={ref} className={cn(contentClass, className)} {...props} />
));
ContextMenuSubContent.displayName = "ContextMenuSubContent";

export const ContextMenuContent = forwardRef<
  React.ElementRef<typeof Radix.Content>,
  React.ComponentPropsWithoutRef<typeof Radix.Content>
>(({ className, ...props }, ref) => (
  <Radix.Portal>
    <Radix.Content ref={ref} className={cn(contentClass, className)} {...props} />
  </Radix.Portal>
));
ContextMenuContent.displayName = "ContextMenuContent";

type ItemProps = React.ComponentPropsWithoutRef<typeof Radix.Item> & {
  destructive?: boolean;
};

export const ContextMenuItem = forwardRef<
  React.ElementRef<typeof Radix.Item>,
  ItemProps
>(({ className, destructive, ...props }, ref) => (
  <Radix.Item
    ref={ref}
    className={cn(itemClass, destructive && itemDestructiveClass, className)}
    {...props}
  />
));
ContextMenuItem.displayName = "ContextMenuItem";

export const ContextMenuCheckboxItem = forwardRef<
  React.ElementRef<typeof Radix.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof Radix.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
  <Radix.CheckboxItem
    ref={ref}
    className={cn(itemClass, "pl-7", className)}
    checked={checked}
    {...props}
  >
    <span className="absolute left-2 flex size-3.5 items-center justify-center">
      <Radix.ItemIndicator>
        <Check className="size-[14px]" aria-hidden="true" />
      </Radix.ItemIndicator>
    </span>
    {children}
  </Radix.CheckboxItem>
));
ContextMenuCheckboxItem.displayName = "ContextMenuCheckboxItem";

export const ContextMenuRadioItem = forwardRef<
  React.ElementRef<typeof Radix.RadioItem>,
  React.ComponentPropsWithoutRef<typeof Radix.RadioItem>
>(({ className, children, ...props }, ref) => (
  <Radix.RadioItem
    ref={ref}
    className={cn(itemClass, "pl-7", className)}
    {...props}
  >
    <span className="absolute left-2 flex size-3.5 items-center justify-center">
      <Radix.ItemIndicator>
        <Circle className="size-[8px] fill-current" aria-hidden="true" />
      </Radix.ItemIndicator>
    </span>
    {children}
  </Radix.RadioItem>
));
ContextMenuRadioItem.displayName = "ContextMenuRadioItem";

export const ContextMenuLabel = forwardRef<
  React.ElementRef<typeof Radix.Label>,
  React.ComponentPropsWithoutRef<typeof Radix.Label>
>(({ className, ...props }, ref) => (
  <Radix.Label ref={ref} className={cn(labelClass, className)} {...props} />
));
ContextMenuLabel.displayName = "ContextMenuLabel";

export const ContextMenuSeparator = forwardRef<
  React.ElementRef<typeof Radix.Separator>,
  React.ComponentPropsWithoutRef<typeof Radix.Separator>
>(({ className, ...props }, ref) => (
  <Radix.Separator ref={ref} className={cn(separatorClass, className)} {...props} />
));
ContextMenuSeparator.displayName = "ContextMenuSeparator";

export function ContextMenuShortcut({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn(shortcutClass, className)} {...props} />;
}
