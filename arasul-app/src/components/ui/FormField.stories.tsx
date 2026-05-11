import { useState } from "react";
import { FormField } from "./FormField";
import { Input } from "./Input";
import { Textarea } from "./Textarea";

export default {
  title: "ui/FormField",
};

export const Basic = () => {
  const [v, setV] = useState("");
  return (
    <FormField label="Your name" description="We'll use this to personalize your workspace.">
      {(props) => (
        <Input value={v} onChange={(e) => setV(e.target.value)} placeholder="Type here" {...props} />
      )}
    </FormField>
  );
};

export const Required = () => {
  const [v, setV] = useState("");
  return (
    <FormField label="Passphrase" required description="At least 4 characters.">
      {(props) => (
        <Input type="password" value={v} onChange={(e) => setV(e.target.value)} {...props} />
      )}
    </FormField>
  );
};

export const WithError = () => (
  <FormField
    label="Passphrase"
    error="Passphrases don't match."
    description="Try again."
  >
    {(props) => <Input type="password" value="bad" onChange={() => {}} {...props} />}
  </FormField>
);

export const Textareas = () => {
  const [v, setV] = useState("");
  return (
    <FormField label="Bio" description="Markdown is supported.">
      {(props) => <Textarea rows={4} value={v} onChange={(e) => setV(e.target.value)} {...props} />}
    </FormField>
  );
};
