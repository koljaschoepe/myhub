/**
 * Tabs — tab-strip + panels.
 *
 * Radix-based. Supports horizontal (default) and vertical orientation.
 *
 * Phase 1.5 Tier 3 (2026-05-11). Replaces the ad-hoc tabs in Settings
 * (vertical sidebar) and LeftPane modals (horizontal "ModalTabs").
 *
 * Usage (horizontal, default):
 * ```tsx
 * <Tabs defaultValue="overview">
 *   <TabsList>
 *     <TabsTrigger value="overview">Overview</TabsTrigger>
 *     <TabsTrigger value="settings">Settings</TabsTrigger>
 *     <TabsTrigger value="advanced">Advanced</TabsTrigger>
 *   </TabsList>
 *   <TabsContent value="overview">…</TabsContent>
 *   <TabsContent value="settings">…</TabsContent>
 *   <TabsContent value="advanced">…</TabsContent>
 * </Tabs>
 * ```
 *
 * Vertical sidebar (Settings pattern):
 * ```tsx
 * <Tabs orientation="vertical" defaultValue="general" className="flex gap-4">
 *   <TabsList orientation="vertical">
 *     <TabsTrigger value="general">General</TabsTrigger>
 *     <TabsTrigger value="editor">Editor</TabsTrigger>
 *   </TabsList>
 *   <TabsContent value="general" className="flex-1">…</TabsContent>
 * </Tabs>
 * ```
 */

import { forwardRef } from "react";
import * as Radix from "@radix-ui/react-tabs";
import { cn } from "../../lib/cn";

export const Tabs = Radix.Root;

export interface TabsListProps
  extends React.ComponentPropsWithoutRef<typeof Radix.List> {
  orientation?: "horizontal" | "vertical";
}

export const TabsList = forwardRef<
  React.ElementRef<typeof Radix.List>,
  TabsListProps
>(({ className, orientation = "horizontal", ...props }, ref) => (
  <Radix.List
    ref={ref}
    className={cn(
      "inline-flex items-center gap-1",
      orientation === "horizontal"
        ? "h-9 border-b border-[color:var(--border-subtle)]"
        : "flex-col items-stretch h-auto w-[180px] gap-0.5",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = "TabsList";

export const TabsTrigger = forwardRef<
  React.ElementRef<typeof Radix.Trigger>,
  React.ComponentPropsWithoutRef<typeof Radix.Trigger>
>(({ className, ...props }, ref) => (
  <Radix.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-start gap-2 whitespace-nowrap",
      "px-3 py-1.5 rounded-md",
      "text-[length:var(--text-body-sm)] font-medium",
      "text-fg-muted hover:text-fg",
      "transition-colors",
      "outline-none focus-visible:[box-shadow:var(--focus-ring)]",
      "disabled:cursor-not-allowed disabled:opacity-50",
      // Active state: horizontal uses bottom border; vertical uses left.
      // The active style is applied via data-[state=active], so consumers
      // can override via classname for fancier active treatments.
      "data-[state=active]:text-fg",
      "data-[orientation=horizontal]:data-[state=active]:bg-overlay",
      "data-[orientation=vertical]:data-[state=active]:bg-overlay",
      "data-[orientation=vertical]:w-full data-[orientation=vertical]:justify-start",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = "TabsTrigger";

export const TabsContent = forwardRef<
  React.ElementRef<typeof Radix.Content>,
  React.ComponentPropsWithoutRef<typeof Radix.Content>
>(({ className, ...props }, ref) => (
  <Radix.Content
    ref={ref}
    className={cn(
      "mt-2 outline-none",
      "focus-visible:[box-shadow:var(--focus-ring)] focus-visible:rounded-md",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = "TabsContent";
