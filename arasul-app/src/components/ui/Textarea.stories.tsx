import { useState } from "react";
import { Textarea } from "./Textarea";

export default {
  title: "ui/Textarea",
};

export const Default = () => (
  <div className="max-w-md">
    <Textarea placeholder="Write a few lines…" rows={4} />
  </div>
);

export const Controlled = () => {
  const [v, setV] = useState("# Welcome\n\nA short markdown note.");
  return (
    <div className="max-w-md flex flex-col gap-2">
      <Textarea value={v} onChange={(e) => setV(e.target.value)} rows={6} />
      <small className="text-fg-muted">{v.length} characters</small>
    </div>
  );
};

export const Disabled = () => (
  <div className="max-w-md">
    <Textarea value="Frozen content" disabled rows={3} />
  </div>
);

export const Invalid = () => (
  <div className="max-w-md">
    <Textarea
      value="missing a colon"
      invalid
      rows={3}
      aria-describedby="ta-err"
    />
    <small id="ta-err" className="text-danger">
      Expected `key: value` syntax.
    </small>
  </div>
);
