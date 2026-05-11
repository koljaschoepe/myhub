/**
 * DropdownMenu — click-triggered menu (e.g. "More actions" buttons).
 *
 * Radix-based. Provides full ARIA correctness: `role="menu"`, arrow-key
 * navigation, type-ahead search, focus restore on close, Escape to dismiss.
 *
 * Phase 1.5 Tier 2 (2026-05-11). Slated to replace ad-hoc dropdowns in
 * MarkdownToolbar (HeadingPicker), LeftPane (PickerMenu), and the
 * RightPane provider switcher during Phase 1.9.
 *
 * Usage:
 * ```tsx
 * <DropdownMenu>
 *   <DropdownMenuTrigger asChild>
 *     <IconButton label="More"><MoreHorizontal /></IconButton>
 *   </DropdownMenuTrigger>
 *   <DropdownMenuContent align="end">
 *     <DropdownMenuLabel>Actions</DropdownMenuLabel>
 *     <DropdownMenuItem onSelect={duplicate}>Duplicate</DropdownMenuItem>
 *     <DropdownMenuItem onSelect={archive}>Archive</DropdownMenuItem>
 *     <DropdownMenuSeparator />
 *     <DropdownMenuItem destructive onSelect={remove}>
 *       Delete
 *     </DropdownMenuItem>
 *   </DropdownMenuContent>
 * </DropdownMenu>
 * ```
 *
 * For sub-menus, use `DropdownMenuSub` + `DropdownMenuSubTrigger`.
 */

import { forwardRef } from "react";
import * as Radix from "@radix-ui/react-dropdown-menu";
import { Check, ChevronRight, Circle } from "lucide-react";
import { cn } from "../../lib/cn";

export const DropdownMenu = Radix.Root;
export const DropdownMenuTrigger = Radix.Trigger;
export const DropdownMenuGroup = Radix.Group;
export const DropdownMenuPortal = Radix.Portal;
export const DropdownMenuSub = Radix.Sub;
export const DropdownMenuRadioGroup = Radix.RadioGroup;

/* Shared classnames so DropdownMenu and ContextMenu look identical. */

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

const subTriggerClass = [
  ...itemClass,
  "data-[state=open]:bg-overlay",
] as const;

const separatorClass = "-mx-1 my-1 h-px bg-[color:var(--border-subtle)]";

const labelClass =
  "px-2 py-1.5 text-[length:var(--text-caption)] font-medium text-fg-muted uppercase tracking-wide";

const shortcutClass =
  "ml-auto pl-3 text-[length:var(--text-caption)] text-fg-muted tracking-wide";

/* Components */

export const DropdownMenuSubTrigger = forwardRef<
  React.ElementRef<typeof Radix.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof Radix.SubTrigger>
>(({ className, children, ...props }, ref) => (
  <Radix.SubTrigger
    ref={ref}
    className={cn(subTriggerClass, className)}
    {...props}
  >
    {children}
    <ChevronRight className="ml-auto" aria-hidden="true" />
  </Radix.SubTrigger>
));
DropdownMenuSubTrigger.displayName = "DropdownMenuSubTrigger";

export const DropdownMenuSubContent = forwardRef<
  React.ElementRef<typeof Radix.SubContent>,
  React.ComponentPropsWithoutRef<typeof Radix.SubContent>
>(({ className, ...props }, ref) => (
  <Radix.SubContent ref={ref} className={cn(contentClass, className)} {...props} />
));
DropdownMenuSubContent.displayName = "DropdownMenuSubContent";

export const DropdownMenuContent = forwardRef<
  React.ElementRef<typeof Radix.Content>,
  React.ComponentPropsWithoutRef<typeof Radix.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <Radix.Portal>
    <Radix.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(contentClass, className)}
      {...props}
    />
  </Radix.Portal>
));
DropdownMenuContent.displayName = "DropdownMenuContent";

type ItemProps = React.ComponentPropsWithoutRef<typeof Radix.Item> & {
  destructive?: boolean;
};

export const DropdownMenuItem = forwardRef<
  React.ElementRef<typeof Radix.Item>,
  ItemProps
>(({ className, destructive, ...props }, ref) => (
  <Radix.Item
    ref={ref}
    className={cn(itemClass, destructive && itemDestructiveClass, className)}
    {...props}
  />
));
DropdownMenuItem.displayName = "DropdownMenuItem";

export const DropdownMenuCheckboxItem = forwardRef<
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
DropdownMenuCheckboxItem.displayName = "DropdownMenuCheckboxItem";

export const DropdownMenuRadioItem = forwardRef<
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
DropdownMenuRadioItem.displayName = "DropdownMenuRadioItem";

export const DropdownMenuLabel = forwardRef<
  React.ElementRef<typeof Radix.Label>,
  React.ComponentPropsWithoutRef<typeof Radix.Label>
>(({ className, ...props }, ref) => (
  <Radix.Label ref={ref} className={cn(labelClass, className)} {...props} />
));
DropdownMenuLabel.displayName = "DropdownMenuLabel";

export const DropdownMenuSeparator = forwardRef<
  React.ElementRef<typeof Radix.Separator>,
  React.ComponentPropsWithoutRef<typeof Radix.Separator>
>(({ className, ...props }, ref) => (
  <Radix.Separator ref={ref} className={cn(separatorClass, className)} {...props} />
));
DropdownMenuSeparator.displayName = "DropdownMenuSeparator";

export function DropdownMenuShortcut({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn(shortcutClass, className)} {...props} />;
}
