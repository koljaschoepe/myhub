import { useState } from "react";
import { Checkbox } from "./Checkbox";

export default {
  title: "ui/Checkbox",
};

export const States = () => (
  <div className="flex flex-col gap-3">
    <label className="flex items-center gap-2 text-fg">
      <Checkbox /> Unchecked
    </label>
    <label className="flex items-center gap-2 text-fg">
      <Checkbox defaultChecked /> Checked
    </label>
    <label className="flex items-center gap-2 text-fg">
      <Checkbox checked="indeterminate" onCheckedChange={() => {}} /> Indeterminate
    </label>
    <label className="flex items-center gap-2 text-fg-muted">
      <Checkbox disabled /> Disabled (off)
    </label>
    <label className="flex items-center gap-2 text-fg-muted">
      <Checkbox disabled defaultChecked /> Disabled (on)
    </label>
  </div>
);

export const Sizes = () => (
  <div className="flex flex-col gap-3">
    <label className="flex items-center gap-2 text-fg">
      <Checkbox size="sm" defaultChecked /> Small (sm)
    </label>
    <label className="flex items-center gap-2 text-fg">
      <Checkbox size="md" defaultChecked /> Medium (md, default)
    </label>
  </div>
);

export const Controlled = () => {
  const [a, setA] = useState(false);
  const [b, setB] = useState(true);
  const [c, setC] = useState(false);
  const allChecked = a && b && c;
  const someChecked = a || b || c;
  const headerState: boolean | "indeterminate" = allChecked
    ? true
    : someChecked
    ? "indeterminate"
    : false;
  const toggleAll = () => {
    const next = !allChecked;
    setA(next); setB(next); setC(next);
  };
  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-2 text-fg font-medium">
        <Checkbox checked={headerState} onCheckedChange={toggleAll} /> Select all
      </label>
      <label className="flex items-center gap-2 text-fg pl-6">
        <Checkbox checked={a} onCheckedChange={(v) => setA(!!v)} /> Notes
      </label>
      <label className="flex items-center gap-2 text-fg pl-6">
        <Checkbox checked={b} onCheckedChange={(v) => setB(!!v)} /> Projects
      </label>
      <label className="flex items-center gap-2 text-fg pl-6">
        <Checkbox checked={c} onCheckedChange={(v) => setC(!!v)} /> Workflows
      </label>
    </div>
  );
};
