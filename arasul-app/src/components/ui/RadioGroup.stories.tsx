import { useState } from "react";
import { RadioGroup, RadioGroupItem } from "./RadioGroup";

export default {
  title: "ui/RadioGroup",
};

export const Theme = () => {
  const [v, setV] = useState("dark");
  return (
    <RadioGroup value={v} onValueChange={setV} className="flex flex-col gap-2 max-w-xs">
      <label className="inline-flex items-center gap-2 text-fg">
        <RadioGroupItem value="light" /> Light
      </label>
      <label className="inline-flex items-center gap-2 text-fg">
        <RadioGroupItem value="dark" /> Dark
      </label>
      <label className="inline-flex items-center gap-2 text-fg">
        <RadioGroupItem value="system" /> Match system
      </label>
    </RadioGroup>
  );
};

export const Autonomy = () => {
  const [v, setV] = useState("ask-writes");
  return (
    <RadioGroup value={v} onValueChange={setV} className="flex flex-col gap-3 max-w-md">
      <label className="flex items-start gap-3 text-fg">
        <RadioGroupItem value="ask-all" className="mt-1" />
        <span>
          <strong className="block">Ask before every action</strong>
          <small className="text-fg-muted">Pause before reads, writes, and shell commands.</small>
        </span>
      </label>
      <label className="flex items-start gap-3 text-fg">
        <RadioGroupItem value="ask-writes" className="mt-1" />
        <span>
          <strong className="block">Ask before writes only</strong>
          <small className="text-fg-muted">Reads run quietly; writes and shell commands pause.</small>
        </span>
      </label>
      <label className="flex items-start gap-3 text-fg">
        <RadioGroupItem value="auto" className="mt-1" />
        <span>
          <strong className="block">Run autonomously</strong>
          <small className="text-fg-muted">Run all reads, writes, and shell commands without prompting.</small>
        </span>
      </label>
    </RadioGroup>
  );
};

export const Disabled = () => (
  <RadioGroup value="b" disabled className="flex flex-col gap-2 max-w-xs">
    <label className="inline-flex items-center gap-2 text-fg-muted">
      <RadioGroupItem value="a" /> Option A
    </label>
    <label className="inline-flex items-center gap-2 text-fg-muted">
      <RadioGroupItem value="b" /> Option B (selected, disabled)
    </label>
  </RadioGroup>
);
