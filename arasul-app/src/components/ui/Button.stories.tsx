import { Save, Trash2 } from "lucide-react";
import { Button } from "./Button";

export default {
  title: "ui/Button",
};

export const Primary = () => <Button variant="primary">Save</Button>;
export const Secondary = () => <Button variant="secondary">Cancel</Button>;
export const Ghost = () => <Button variant="ghost">Skip</Button>;
export const Destructive = () => (
  <Button variant="destructive">Delete drive</Button>
);
export const Link = () => <Button variant="link">Learn more</Button>;

export const Sizes = () => (
  <div className="flex items-center gap-3">
    <Button variant="primary" size="sm">Small</Button>
    <Button variant="primary" size="md">Medium</Button>
    <Button variant="primary" size="lg">Large</Button>
  </div>
);

export const WithIcons = () => (
  <div className="flex items-center gap-3">
    <Button variant="primary"><Save size={14} /> Save</Button>
    <Button variant="destructive"><Trash2 size={14} /> Delete</Button>
  </div>
);

export const Loading = () => (
  <div className="flex items-center gap-3">
    <Button variant="primary" loading>Saving</Button>
    <Button variant="secondary" loading>Working</Button>
  </div>
);

export const Disabled = () => (
  <div className="flex items-center gap-3">
    <Button variant="primary" disabled>Disabled primary</Button>
    <Button variant="ghost" disabled>Disabled ghost</Button>
  </div>
);
