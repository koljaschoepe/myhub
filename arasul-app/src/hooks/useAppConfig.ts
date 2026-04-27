import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSession } from "../lib/session";

export type AppConfig = {
  general: {
    name: string;
    default_shell: string;
  };
  editor: {
    font_size: number;
    line_numbers: boolean;
    word_wrap: boolean;
    default_view: "wysiwyg" | "source" | "split";
  };
  terminal: {
    font_size: number;
    cols: number;
    rows: number;
    scrollback: number;
  };
  claude: {
    model: string;
    temperature: number;
    system_prompt: string;
  };
  github: {
    commit_template: string;
    default_private: boolean;
  };
  vault: {
    auto_lock_minutes: number;
  };
};

const DEFAULTS: AppConfig = {
  general: { name: "", default_shell: "bash" },
  editor: { font_size: 14, line_numbers: true, word_wrap: true, default_view: "wysiwyg" },
  terminal: { font_size: 13, cols: 120, rows: 30, scrollback: 1000 },
  claude: { model: "claude-opus-4-7", temperature: 1.0, system_prompt: "" },
  github: { commit_template: "Update from Arasul · {ts}", default_private: true },
  vault: { auto_lock_minutes: 0 },
};

/**
 * Read-once snapshot of `memory/config.toml` at the drive root, layered
 * over the DEFAULTS so consumers always get a complete object.
 *
 * Components call this on mount; saved-after-this changes only take
 * effect on the next mount (e.g. file switch, terminal restart). The
 * Settings tabs show a hint when this matters.
 */
export function useAppConfig(): AppConfig {
  const { driveRoot } = useSession();
  const [cfg, setCfg] = useState<AppConfig>(DEFAULTS);

  useEffect(() => {
    void invoke<Partial<AppConfig>>("get_config", { driveRoot })
      .then((raw) => {
        setCfg({
          general:  { ...DEFAULTS.general,  ...(raw.general  ?? {}) },
          editor:   { ...DEFAULTS.editor,   ...(raw.editor   ?? {}) },
          terminal: { ...DEFAULTS.terminal, ...(raw.terminal ?? {}) },
          claude:   { ...DEFAULTS.claude,   ...(raw.claude   ?? {}) },
          github:   { ...DEFAULTS.github,   ...(raw.github   ?? {}) },
          vault:    { ...DEFAULTS.vault,    ...(raw.vault    ?? {}) },
        });
      })
      .catch(() => { /* missing file → defaults */ });
  }, [driveRoot]);

  return cfg;
}
