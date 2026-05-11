/**
 * components/ui/ — Arasul design-system primitives.
 *
 * Phase 1.5 (2026-05-11): COMPLETE — Tier 1 + Tier 2 + Tier 3 shipped.
 *   Tier 1 (interaction surface):
 *     - Button         · primary/secondary/ghost/destructive/link · sm/md/lg
 *     - IconButton     · with built-in Tooltip · 24+ hit-area (WCAG 2.5.8)
 *     - Tooltip        · Radix-based · 1.5s delay default
 *     - Dialog         · Radix-based · replaces 4 ad-hoc modal patterns
 *   Tier 2 (menus + display):
 *     - DropdownMenu   · click-triggered · ARIA-correct keyboard nav
 *     - ContextMenu    · right-click-triggered · same visual API as DropdownMenu
 *     - Badge          · neutral/accent/success/warning/danger/info · soft/solid/outline
 *     - FormField      · label + description + error · auto useId/aria wiring
 *   Tier 3 (form controls):
 *     - Input          · text/email/password/search/number · sm/md/lg · leading/trailing slots
 *     - Textarea       · multi-line · resize-y · invalid state
 *     - Select         · Radix dropdown · Trigger/Content/Item/Separator/Label/Group
 *     - Switch         · binary toggle · sm/md
 *     - Checkbox       · multi-select · indeterminate · sm/md
 *     - RadioGroup     · mutually-exclusive · works as plain or card-style
 *     - Tabs           · horizontal + vertical · for Settings sidebar
 *
 * All primitives:
 *   - Reference CSS-var tokens from theme.css (never hex/px literals)
 *   - Use Tailwind v4 utility classes via `cn()` for layout/typography
 *   - Forward refs + spread props for composability
 *   - Wrap Radix where applicable for ARIA correctness
 *
 * Reference: docs/design/tokens.md, docs/plans/2026-05-11-frontend-ux-overhaul.md
 */

export { Button, buttonVariants, type ButtonProps } from "./Button";
export { IconButton, iconButtonVariants, type IconButtonProps } from "./IconButton";

export {
  Tooltip,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
  TooltipPortal,
  TooltipContent,
  TooltipArrow,
} from "./Tooltip";

export {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogClose,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  type DialogContentProps,
} from "./Dialog";

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuRadioGroup,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
} from "./DropdownMenu";

export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuGroup,
  ContextMenuPortal,
  ContextMenuSub,
  ContextMenuRadioGroup,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuRadioItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
} from "./ContextMenu";

export { Badge, badgeVariants, type BadgeProps } from "./Badge";

export {
  FormField,
  type FormFieldProps,
  type FormFieldRenderProps,
} from "./FormField";

export { Input, inputContainerVariants, type InputProps } from "./Input";
export { Textarea, type TextareaProps } from "./Textarea";

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  type SelectTriggerProps,
} from "./Select";

export { Switch, type SwitchProps } from "./Switch";
export { Checkbox, type CheckboxProps } from "./Checkbox";
export { RadioGroup, RadioGroupItem } from "./RadioGroup";

export {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  type TabsListProps,
} from "./Tabs";
