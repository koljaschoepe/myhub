import { useState } from "react";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectGroup,
} from "./Select";

export default {
  title: "ui/Select",
};

export const Default = () => {
  const [v, setV] = useState("bash");
  return (
    <div className="max-w-xs">
      <Select value={v} onValueChange={setV}>
        <SelectTrigger>{v}</SelectTrigger>
        <SelectContent>
          <SelectItem value="bash">bash</SelectItem>
          <SelectItem value="zsh">zsh</SelectItem>
          <SelectItem value="fish">fish</SelectItem>
          <SelectItem value="powershell.exe">powershell.exe</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};

export const Grouped = () => {
  const [v, setV] = useState("anthropic-claude");
  return (
    <div className="max-w-xs">
      <Select value={v} onValueChange={setV}>
        <SelectTrigger>{v}</SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Subscription</SelectLabel>
            <SelectItem value="anthropic-claude">Anthropic — Claude</SelectItem>
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>API</SelectLabel>
            <SelectItem value="openai-codex">OpenAI — Codex</SelectItem>
            <SelectItem value="google-gemini">Google — Gemini</SelectItem>
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>Local</SelectLabel>
            <SelectItem value="ollama">Ollama</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
};

export const Disabled = () => (
  <div className="max-w-xs">
    <Select value="bash" onValueChange={() => {}} disabled>
      <SelectTrigger>bash</SelectTrigger>
      <SelectContent>
        <SelectItem value="bash">bash</SelectItem>
      </SelectContent>
    </Select>
  </div>
);
