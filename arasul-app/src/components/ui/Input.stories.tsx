import { useState } from "react";
import { Search, Mail, Eye, EyeOff, X } from "lucide-react";
import { Input } from "./Input";
import { IconButton } from "./IconButton";

export default {
  title: "ui/Input",
};

export const Sizes = () => (
  <div className="flex flex-col gap-3 max-w-sm">
    <Input size="sm" placeholder="Small (sm)" />
    <Input size="md" placeholder="Medium (md, default)" />
    <Input size="lg" placeholder="Large (lg)" />
  </div>
);

export const WithLeadingIcon = () => (
  <div className="max-w-sm">
    <Input leading={<Search />} placeholder="Search files…" />
  </div>
);

export const WithTrailingAction = () => {
  const [v, setV] = useState("draft");
  return (
    <div className="max-w-sm">
      <Input
        value={v}
        onChange={(e) => setV(e.target.value)}
        trailing={
          v && (
            <IconButton size="sm" variant="ghost" label="Clear" onClick={() => setV("")}>
              <X />
            </IconButton>
          )
        }
        placeholder="Type to see clear button"
      />
    </div>
  );
};

export const PasswordToggle = () => {
  const [show, setShow] = useState(false);
  const [pw, setPw] = useState("hunter2");
  return (
    <div className="max-w-sm">
      <Input
        type={show ? "text" : "password"}
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        leading={<Mail />}
        trailing={
          <IconButton
            size="sm"
            variant="ghost"
            label={show ? "Hide password" : "Show password"}
            onClick={() => setShow((s) => !s)}
          >
            {show ? <EyeOff /> : <Eye />}
          </IconButton>
        }
      />
    </div>
  );
};

export const Disabled = () => (
  <div className="max-w-sm">
    <Input value="readonly value" disabled />
  </div>
);

export const Invalid = () => (
  <div className="max-w-sm">
    <Input value="not-an-email" invalid />
  </div>
);
