import { Save, Trash2, Settings, X } from "lucide-react";
import { IconButton } from "./IconButton";

export default {
  title: "ui/IconButton",
};

export const Default = () => (
  <IconButton label="Save"><Save /></IconButton>
);

export const Sizes = () => (
  <div className="flex items-center gap-3">
    <IconButton label="Save (small)" size="sm"><Save /></IconButton>
    <IconButton label="Save (medium)" size="md"><Save /></IconButton>
    <IconButton label="Save (large)" size="lg"><Save /></IconButton>
  </div>
);

export const Variants = () => (
  <div className="flex items-center gap-3">
    <IconButton label="Primary" variant="primary"><Save /></IconButton>
    <IconButton label="Ghost" variant="ghost"><Settings /></IconButton>
    <IconButton label="Outline" variant="outline"><Settings /></IconButton>
    <IconButton label="Delete" variant="destructive"><Trash2 /></IconButton>
  </div>
);

export const WithoutTooltip = () => (
  <IconButton label="Close" showTooltip={false}><X /></IconButton>
);

export const HitAreaCheck = () => (
  <div className="flex items-center gap-3">
    {/* WCAG 2.5.8 — 24×24 minimum hit area at every size. The visible
        icon stays small; padding fills the touch target. */}
    <IconButton label="sm (24px)" size="sm" className="outline outline-1 outline-dashed outline-info"><Save /></IconButton>
    <IconButton label="md (32px)" size="md" className="outline outline-1 outline-dashed outline-info"><Save /></IconButton>
    <IconButton label="lg (40px)" size="lg" className="outline outline-1 outline-dashed outline-info"><Save /></IconButton>
  </div>
);
