import { useState } from "react";
import { Switch } from "./Switch";
import { FormField } from "./FormField";

export default {
  title: "ui/Switch",
};

export const Sizes = () => {
  const [a, setA] = useState(false);
  const [b, setB] = useState(true);
  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-3 text-fg">
        <Switch size="sm" checked={a} onCheckedChange={setA} /> Small (sm)
      </label>
      <label className="flex items-center gap-3 text-fg">
        <Switch size="md" checked={b} onCheckedChange={setB} /> Medium (md, default)
      </label>
    </div>
  );
};

export const InFormField = () => {
  const [on, setOn] = useState(true);
  return (
    <div className="max-w-md">
      <FormField
        label="Reduce motion"
        description="Honors the system-wide preference and disables transitions in the app."
      >
        {(props) => <Switch {...props} checked={on} onCheckedChange={setOn} />}
      </FormField>
    </div>
  );
};

export const Disabled = () => (
  <div className="flex flex-col gap-3">
    <label className="flex items-center gap-3 text-fg-muted">
      <Switch disabled checked={false} /> Disabled, off
    </label>
    <label className="flex items-center gap-3 text-fg-muted">
      <Switch disabled checked /> Disabled, on
    </label>
  </div>
);
