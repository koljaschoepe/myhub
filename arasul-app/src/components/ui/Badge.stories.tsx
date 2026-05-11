import { Badge } from "./Badge";

export default {
  title: "ui/Badge",
};

const TONES = ["neutral", "accent", "success", "warning", "danger", "info"] as const;

export const Soft = () => (
  <div className="flex flex-wrap gap-2">
    {TONES.map((t) => <Badge key={t} tone={t}>{t}</Badge>)}
  </div>
);

export const Solid = () => (
  <div className="flex flex-wrap gap-2">
    {TONES.map((t) => <Badge key={t} tone={t} variant="solid">{t}</Badge>)}
  </div>
);

export const Outline = () => (
  <div className="flex flex-wrap gap-2">
    {TONES.map((t) => <Badge key={t} tone={t} variant="outline">{t}</Badge>)}
  </div>
);

export const RealWorldExamples = () => (
  <div className="flex flex-col gap-3">
    <div className="flex items-center gap-2">
      Status: <Badge tone="success">Connected</Badge>
    </div>
    <div className="flex items-center gap-2">
      Version: <Badge tone="accent">v3.1</Badge>
    </div>
    <div className="flex items-center gap-2">
      Health: <Badge tone="warning" variant="outline">Stale</Badge>
    </div>
    <div className="flex items-center gap-2">
      Update: <Badge tone="danger">Failed</Badge>
    </div>
  </div>
);
