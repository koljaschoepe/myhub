import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSession } from "../lib/session";
import { getTheme, setTheme, type ThemeChoice } from "../lib/theme";
import { getDensity, setDensity, type DensityChoice } from "../lib/density";
import { notify } from "../lib/toast";
import {
  Dialog,
  DialogContent,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Button,
  Input,
  Textarea,
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  Switch,
  RadioGroup,
  RadioGroupItem,
  FormField,
  Badge,
} from "../components/ui";
import "./Settings.css";

type Tab =
  | "general"
  | "appearance"
  | "editor"
  | "terminal"
  | "claude"
  | "github"
  | "drive"
  | "vault"
  | "privacy"
  | "updates"
  | "about";

const TAB_ORDER: Tab[] = [
  "general", "appearance", "editor", "terminal", "claude",
  "github", "drive", "vault", "privacy", "updates", "about",
];

const LABELS: Record<Tab, string> = {
  general:    "General",
  appearance: "Appearance",
  editor:     "Editor",
  terminal:   "Terminal",
  claude:     "Claude AI",
  github:     "GitHub",
  drive:      "Drive",
  vault:      "Drive lock",
  privacy:    "Privacy",
  updates:    "Updates",
  about:      "About",
};

type GithubAccount = { login: string; avatar_url?: string | null; name?: string | null };
type UpdateInfo = {
  current_version: string;
  latest_version: string;
  update_available: boolean;
  download_url?: string | null;
};
type HealthReport = {
  drive_free_mb: number;
  vault_present: boolean;
  claude_binary_present: boolean;
  memory_consistent: boolean;
  issues: string[];
};
type Stats = { notes: number; projects: number; lines: number };

/**
 * Settings — 11-category sidebar+pane modal.
 *
 * Phase 1.6 (2026-05-11): migrated to the new design-system primitives
 * (Dialog + Tabs + Button + Input + Select + Switch + RadioGroup +
 * FormField + Badge). Drops the custom focus-trap (Radix Dialog handles
 * it), the bespoke Toggle helper (Switch + FormField replaces), and the
 * eleven inline `<select>` elements (Radix Select gives consistent
 * cross-platform styling).
 *
 * Legacy CSS rules under `.arasul-settings-tab-body` are kept for layout
 * affordances reused below (`.arasul-kv`, `.arasul-actions`, `.arasul-muted`,
 * `.arasul-error`). Form-control rules are now obsolete and will be cleaned
 * up during the next Settings.css audit.
 */
export function Settings({
  onClose,
  initialTab,
}: {
  onClose: () => void;
  initialTab?: Tab;
}) {
  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        size="xl"
        titleSlot={null}
        hideCloseButton
        // Override the default DialogContent padding/gap so the sidebar +
        // body can sit flush against the rounded edge. Height is fixed to
        // match the legacy Settings dimensions.
        className="p-0 gap-0 h-[min(620px,90vh)] max-h-[90vh] overflow-hidden bg-[color:var(--bg-pane)]"
      >
        <Tabs
          orientation="vertical"
          defaultValue={initialTab ?? "general"}
          className="flex h-full max-md:flex-col"
        >
          <aside className="w-[200px] shrink-0 flex flex-col p-3 bg-canvas border-r border-border-subtle max-md:w-full max-md:flex-row max-md:overflow-x-auto max-md:border-r-0 max-md:border-b max-md:border-border-subtle max-md:p-2">
            <div
              id="settings-title"
              className="px-3 py-2 mb-3 text-[length:var(--text-h4)] font-semibold text-fg max-md:hidden"
            >
              Settings
            </div>
            <TabsList
              orientation="vertical"
              className="w-full !border-b-0 !h-auto gap-0.5 max-md:w-auto max-md:flex-row"
            >
              {TAB_ORDER.map((t) => (
                <TabsTrigger
                  key={t}
                  value={t}
                  className="max-md:shrink-0 max-md:whitespace-nowrap"
                >
                  {LABELS[t]}
                </TabsTrigger>
              ))}
            </TabsList>
            <div className="flex-1 max-md:hidden" />
            <Button variant="ghost" size="sm" onClick={onClose} className="max-md:hidden">
              Close
            </Button>
          </aside>

          <main className="flex-1 min-w-0 overflow-y-auto px-8 py-6 bg-[color:var(--bg-pane)] max-md:px-5 max-md:py-4">
            <TabsContent value="general"   className="!mt-0"><GeneralTab /></TabsContent>
            <TabsContent value="appearance" className="!mt-0"><AppearanceTab /></TabsContent>
            <TabsContent value="editor"    className="!mt-0"><EditorTab /></TabsContent>
            <TabsContent value="terminal"  className="!mt-0"><TerminalTab /></TabsContent>
            <TabsContent value="claude"    className="!mt-0"><ClaudeTab /></TabsContent>
            <TabsContent value="github"    className="!mt-0"><GithubTab /></TabsContent>
            <TabsContent value="drive"     className="!mt-0"><DriveTab /></TabsContent>
            <TabsContent value="vault"     className="!mt-0"><VaultTab /></TabsContent>
            <TabsContent value="privacy"   className="!mt-0"><PrivacyTab /></TabsContent>
            <TabsContent value="updates"   className="!mt-0"><UpdatesTab /></TabsContent>
            <TabsContent value="about"     className="!mt-0"><AboutTab /></TabsContent>
          </main>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================
 * Shared layout
 * ============================================================ */

function TabBody({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="max-w-[560px] flex flex-col gap-4">
      <h2 className="text-[length:var(--text-h3)] font-semibold text-fg m-0">{title}</h2>
      {children}
    </div>
  );
}

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      {title && (
        <h3 className="text-[length:var(--text-caption)] font-medium text-fg uppercase tracking-wide m-0">
          {title}
        </h3>
      )}
      {children}
    </section>
  );
}

/* ============================================================
 * General — name, default shell
 * ============================================================ */

function GeneralTab() {
  const { driveRoot } = useSession();
  const [name, setName] = useState("");
  const [defaultShell, setDefaultShell] = useState("bash");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void invoke<{ general?: { name?: string; default_shell?: string } }>("get_config", { driveRoot })
      .then((cfg) => {
        setName(cfg.general?.name ?? "");
        setDefaultShell(cfg.general?.default_shell ?? "bash");
      })
      .catch(() => {});
  }, [driveRoot]);

  const save = async () => {
    setSaving(true);
    try {
      await invoke("set_config", {
        driveRoot,
        patch: { general: { name, default_shell: defaultShell } },
      });
      notify.ok("Settings saved");
    } catch (e) {
      notify.err("Couldn't save settings", e);
    } finally { setSaving(false); }
  };

  return (
    <TabBody title="General">
      <FormField label="Your name">
        {(props) => (
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            maxLength={50}
            {...props}
          />
        )}
      </FormField>

      <FormField label="Default shell" description="Used when opening new terminal tabs.">
        {(props) => (
          <Select value={defaultShell} onValueChange={setDefaultShell}>
            <SelectTrigger id={props.id} aria-describedby={props["aria-describedby"]}>
              {defaultShell}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bash">bash</SelectItem>
              <SelectItem value="zsh">zsh</SelectItem>
              <SelectItem value="fish">fish</SelectItem>
              <SelectItem value="powershell.exe">powershell.exe</SelectItem>
            </SelectContent>
          </Select>
        )}
      </FormField>

      <div>
        <Button variant="primary" onClick={save} loading={saving}>
          {saving ? "Saving" : "Save"}
        </Button>
      </div>
    </TabBody>
  );
}

/* ============================================================
 * Appearance — theme, density (live, localStorage-persisted)
 * ============================================================ */

function AppearanceTab() {
  const [theme, setThemeState] = useState<ThemeChoice>(() => getTheme());
  const [density, setDensityState] = useState<DensityChoice>(() => getDensity());

  return (
    <TabBody title="Appearance">
      <Section title="Theme">
        <p className="text-[length:var(--text-body-sm)] text-fg-muted m-0">
          System matches your Mac's light/dark setting and switches automatically.
        </p>
        <RadioGroup
          value={theme}
          onValueChange={(v) => { setThemeState(v as ThemeChoice); setTheme(v as ThemeChoice); }}
          className="grid-flow-col w-fit"
          aria-label="Theme"
        >
          {(["system", "dark", "light"] as ThemeChoice[]).map((opt) => (
            <label
              key={opt}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-md border border-border-default bg-elevated cursor-pointer data-[state=checked]:border-accent data-[state=checked]:bg-accent-soft data-[state=checked]:text-accent has-[input:focus-visible]:[box-shadow:var(--focus-ring)]"
              data-state={theme === opt ? "checked" : "unchecked"}
            >
              <RadioGroupItem value={opt} className="sr-only" />
              <span className="text-[length:var(--text-body-sm)] font-medium">
                {opt === "system" ? "System" : opt === "dark" ? "Dark" : "Light"}
              </span>
            </label>
          ))}
        </RadioGroup>
      </Section>

      <Section title="UI density">
        <p className="text-[length:var(--text-body-sm)] text-fg-muted m-0">
          Tighten or loosen spacing across the whole app. Useful on small laptops.
        </p>
        <RadioGroup
          value={density}
          onValueChange={(v) => { setDensityState(v as DensityChoice); setDensity(v as DensityChoice); }}
          className="grid-flow-col w-fit"
          aria-label="Density"
        >
          {(["compact", "normal", "spacious"] as DensityChoice[]).map((opt) => (
            <label
              key={opt}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-md border border-border-default bg-elevated cursor-pointer data-[state=checked]:border-accent data-[state=checked]:bg-accent-soft data-[state=checked]:text-accent has-[input:focus-visible]:[box-shadow:var(--focus-ring)]"
              data-state={density === opt ? "checked" : "unchecked"}
            >
              <RadioGroupItem value={opt} className="sr-only" />
              <span className="text-[length:var(--text-body-sm)] font-medium">
                {opt[0].toUpperCase() + opt.slice(1)}
              </span>
            </label>
          ))}
        </RadioGroup>
      </Section>
    </TabBody>
  );
}

/* ============================================================
 * Editor — font size, line numbers, word wrap (persisted)
 * ============================================================ */

type EditorPrefs = {
  font_size: number;
  line_numbers: boolean;
  word_wrap: boolean;
  default_view: "split" | "wysiwyg" | "source";
};

function EditorTab() {
  const { driveRoot } = useSession();
  const [prefs, setPrefs] = useState<EditorPrefs>({
    font_size: 14,
    line_numbers: true,
    word_wrap: true,
    default_view: "wysiwyg",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void invoke<{ editor?: Partial<EditorPrefs> }>("get_config", { driveRoot })
      .then((cfg) => { if (cfg.editor) setPrefs((p) => ({ ...p, ...cfg.editor })); })
      .catch(() => {});
  }, [driveRoot]);

  const save = async () => {
    setSaving(true);
    try {
      await invoke("set_config", { driveRoot, patch: { editor: prefs } });
      notify.ok("Editor settings saved", "Open a file again to see the change.");
    } catch (e) {
      notify.err("Couldn't save", e);
    } finally { setSaving(false); }
  };

  return (
    <TabBody title="Editor">
      <FormField label="Font size">
        {(props) => (
          <Select
            value={String(prefs.font_size)}
            onValueChange={(v) => setPrefs({ ...prefs, font_size: Number(v) })}
          >
            <SelectTrigger id={props.id}>{prefs.font_size} px</SelectTrigger>
            <SelectContent>
              {[12, 13, 14, 15, 16, 18, 20].map((n) => (
                <SelectItem key={n} value={String(n)}>{n} px</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </FormField>

      <FormField label="Default view" description="WYSIWYG renders formatting; Source shows raw markdown.">
        {(props) => (
          <Select
            value={prefs.default_view}
            onValueChange={(v) => setPrefs({ ...prefs, default_view: v as EditorPrefs["default_view"] })}
          >
            <SelectTrigger id={props.id}>
              {prefs.default_view === "wysiwyg" ? "WYSIWYG (formatted)" : "Source (raw markdown)"}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="wysiwyg">WYSIWYG (formatted)</SelectItem>
              <SelectItem value="source">Source (raw markdown)</SelectItem>
            </SelectContent>
          </Select>
        )}
      </FormField>

      <ToggleRow
        label="Show line numbers in code editor"
        checked={prefs.line_numbers}
        onChange={(v) => setPrefs({ ...prefs, line_numbers: v })}
      />
      <ToggleRow
        label="Wrap long lines"
        checked={prefs.word_wrap}
        onChange={(v) => setPrefs({ ...prefs, word_wrap: v })}
      />

      <div>
        <Button variant="primary" onClick={save} loading={saving}>
          {saving ? "Saving" : "Save"}
        </Button>
      </div>
    </TabBody>
  );
}

/* ============================================================
 * Terminal — font size, default cols/rows (persisted)
 * ============================================================ */

type TerminalPrefs = {
  font_size: number;
  cols: number;
  rows: number;
  scrollback: number;
};

function TerminalTab() {
  const { driveRoot } = useSession();
  const [prefs, setPrefs] = useState<TerminalPrefs>({
    font_size: 13, cols: 120, rows: 30, scrollback: 1000,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void invoke<{ terminal?: Partial<TerminalPrefs> }>("get_config", { driveRoot })
      .then((cfg) => { if (cfg.terminal) setPrefs((p) => ({ ...p, ...cfg.terminal })); })
      .catch(() => {});
  }, [driveRoot]);

  const save = async () => {
    setSaving(true);
    try {
      await invoke("set_config", { driveRoot, patch: { terminal: prefs } });
      notify.ok("Terminal settings saved", "Open a new terminal tab to see the change.");
    } catch (e) {
      notify.err("Couldn't save", e);
    } finally { setSaving(false); }
  };

  const numberSelect = (
    field: keyof TerminalPrefs,
    options: number[],
    suffix?: string,
  ) => (
    <Select
      value={String(prefs[field])}
      onValueChange={(v) => setPrefs({ ...prefs, [field]: Number(v) })}
    >
      <SelectTrigger>
        {prefs[field].toLocaleString()}{suffix ? ` ${suffix}` : ""}
      </SelectTrigger>
      <SelectContent>
        {options.map((n) => (
          <SelectItem key={n} value={String(n)}>
            {n.toLocaleString()}{suffix ? ` ${suffix}` : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <TabBody title="Terminal">
      <p className="text-[length:var(--text-body-sm)] text-fg-muted m-0">
        Defaults applied to new terminal tabs. Existing tabs stay as they are.
      </p>

      <FormField label="Font size">{() => numberSelect("font_size", [11, 12, 13, 14, 15, 16], "px")}</FormField>
      <FormField label="Default columns">{() => numberSelect("cols", [80, 100, 120, 140, 160, 200])}</FormField>
      <FormField label="Default rows">{() => numberSelect("rows", [20, 24, 30, 40, 50])}</FormField>
      <FormField label="Scrollback (lines)">{() => numberSelect("scrollback", [500, 1000, 2500, 5000, 10000])}</FormField>

      <div>
        <Button variant="primary" onClick={save} loading={saving}>
          {saving ? "Saving" : "Save"}
        </Button>
      </div>
    </TabBody>
  );
}

/* ============================================================
 * Claude AI — model, temperature, system prompt (persisted)
 * ============================================================ */

type ClaudePrefs = {
  model: string;
  temperature: number;
  system_prompt: string;
};

const MODEL_LABEL: Record<string, string> = {
  "claude-opus-4-7": "Opus 4.7 — most capable",
  "claude-sonnet-4-6": "Sonnet 4.6 — fast + balanced",
  "claude-haiku-4-5-20251001": "Haiku 4.5 — fastest, lowest cost",
};

function ClaudeTab() {
  const { driveRoot } = useSession();
  const [prefs, setPrefs] = useState<ClaudePrefs>({
    model: "claude-opus-4-7",
    temperature: 1.0,
    system_prompt: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void invoke<{ claude?: Partial<ClaudePrefs> }>("get_config", { driveRoot })
      .then((cfg) => { if (cfg.claude) setPrefs((p) => ({ ...p, ...cfg.claude })); })
      .catch(() => {});
  }, [driveRoot]);

  const save = async () => {
    setSaving(true);
    try {
      await invoke("set_config", { driveRoot, patch: { claude: prefs } });
      notify.ok("Claude settings saved");
    } catch (e) {
      notify.err("Couldn't save", e);
    } finally { setSaving(false); }
  };

  return (
    <TabBody title="Claude AI">
      <p className="text-[length:var(--text-body-sm)] text-fg-muted m-0">
        Settings used when Arasul talks to Claude. Defaults are tuned for general writing
        and code work.
      </p>

      <FormField label="Model">
        {(props) => (
          <Select value={prefs.model} onValueChange={(v) => setPrefs({ ...prefs, model: v })}>
            <SelectTrigger id={props.id}>{MODEL_LABEL[prefs.model] ?? prefs.model}</SelectTrigger>
            <SelectContent>
              {Object.entries(MODEL_LABEL).map(([id, label]) => (
                <SelectItem key={id} value={id}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </FormField>

      <FormField
        label={
          <span className="flex items-center justify-between w-full">
            <span>Temperature</span>
            <span className="text-fg-muted font-mono tabular-nums">{prefs.temperature.toFixed(1)}</span>
          </span>
        }
        description={
          <>
            Lower means consistent answers, higher means more creative variation.{" "}
            <strong>1.0</strong> is a good default.
          </>
        }
        descriptionPosition="below"
      >
        {(props) => (
          <input
            type="range"
            min={0} max={2} step={0.1}
            value={prefs.temperature}
            onChange={(e) => setPrefs({ ...prefs, temperature: Number(e.target.value) })}
            className="w-full accent-[color:var(--accent)]"
            {...props}
          />
        )}
      </FormField>

      <FormField label="Custom system prompt (optional)">
        {(props) => (
          <Textarea
            rows={4}
            value={prefs.system_prompt}
            onChange={(e) => setPrefs({ ...prefs, system_prompt: e.target.value })}
            placeholder="e.g. 'You are a helpful writing assistant. Be concise.'"
            {...props}
          />
        )}
      </FormField>

      <div>
        <Button variant="primary" onClick={save} loading={saving}>
          {saving ? "Saving" : "Save"}
        </Button>
      </div>
    </TabBody>
  );
}

/* ============================================================
 * GitHub — token + commit message template
 * ============================================================ */

function GithubTab() {
  const { state, driveRoot } = useSession();
  const handle = state.status === "unlocked" ? state.handle : "";
  const [account, setAccount] = useState<GithubAccount | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [commitTemplate, setCommitTemplate] = useState("Update from Arasul · {ts}");
  const [defaultPrivate, setDefaultPrivate] = useState(true);

  useEffect(() => {
    if (!handle) return;
    void invoke<GithubAccount | null>("github_account", { handle })
      .then((acct) => setAccount(acct))
      .catch(() => setAccount(null));
  }, [handle, reloadKey]);

  useEffect(() => {
    void invoke<{ github?: { commit_template?: string; default_private?: boolean } }>("get_config", { driveRoot })
      .then((cfg) => {
        if (cfg.github?.commit_template) setCommitTemplate(cfg.github.commit_template);
        if (cfg.github?.default_private !== undefined) setDefaultPrivate(cfg.github.default_private);
      })
      .catch(() => {});
  }, [driveRoot]);

  const saveDefaults = async () => {
    try {
      await invoke("set_config", {
        driveRoot,
        patch: { github: { commit_template: commitTemplate, default_private: defaultPrivate } },
      });
      notify.ok("GitHub defaults saved");
    } catch (e) {
      notify.err("Couldn't save", e);
    }
  };

  const connect = async () => {
    if (!token.trim() || !handle) return;
    setBusy(true);
    try {
      const acct = await invoke<GithubAccount>("github_test_token", { token: token.trim() });
      await invoke("vault_set_secret", { handle, key: "github_token", value: token.trim() });
      setAccount(acct);
      setToken("");
      notify.ok(`Connected as ${acct.login}`);
    } catch (e) {
      notify.err("Couldn't connect", e);
    } finally { setBusy(false); }
  };

  const disconnect = async () => {
    if (!handle) return;
    setBusy(true);
    try {
      await invoke("vault_set_secret", { handle, key: "github_token", value: "" });
      setAccount(null);
      setReloadKey((k) => k + 1);
      notify.ok("GitHub disconnected");
    } finally { setBusy(false); }
  };

  return (
    <TabBody title="GitHub">
      <p className="text-[length:var(--text-body-sm)] text-fg-muted m-0">
        Connect your GitHub account once — projects can then be pushed/pulled with one click,
        and creating a new project automatically provisions a private repo.
      </p>

      {account ? (
        <Section title="Connected">
          <div className="arasul-kv">
            <div><span>Login</span><span>{account.login}</span></div>
            {account.name && <div><span>Name</span><span>{account.name}</span></div>}
          </div>
          <div>
            <Button variant="ghost" onClick={disconnect} loading={busy}>
              Disconnect
            </Button>
          </div>
        </Section>
      ) : (
        <Section title="Personal Access Token">
          <p className="text-[length:var(--text-body-sm)] text-fg-muted m-0">
            Create one at{" "}
            <a
              href="https://github.com/settings/personal-access-tokens/new"
              target="_blank" rel="noreferrer"
              className="text-accent underline-offset-2 hover:underline"
            >
              github.com → Settings → Developer settings → Fine-grained tokens
            </a>{" "}
            with the following permissions:
          </p>
          <ul className="pl-6 m-0 text-[length:var(--text-body-sm)] text-fg-muted leading-[1.6]">
            <li>Repository · Contents · <strong>Read &amp; Write</strong></li>
            <li>Repository · Metadata · <strong>Read</strong></li>
            <li>Account · Administration · <strong>Read &amp; Write</strong> <em>(for repo creation)</em></li>
          </ul>
          <FormField label="Token">
            {(props) => (
              <Input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="github_pat_…"
                autoComplete="off"
                spellCheck={false}
                {...props}
              />
            )}
          </FormField>
          <div>
            <Button
              variant="primary"
              onClick={connect}
              loading={busy}
              disabled={busy || !token.trim() || !handle}
            >
              {busy ? "Checking" : "Connect"}
            </Button>
          </div>
        </Section>
      )}

      <Section title="Defaults for new projects">
        <ToggleRow
          label="Auto-create new GitHub repos as private"
          checked={defaultPrivate}
          onChange={setDefaultPrivate}
        />
        <FormField
          label="Commit message template"
          description={<>Use <code>{"{ts}"}</code> for the timestamp. Used when you click Push without typing a message.</>}
          descriptionPosition="below"
        >
          {(props) => (
            <Input
              value={commitTemplate}
              onChange={(e) => setCommitTemplate(e.target.value)}
              placeholder="Update from Arasul · {ts}"
              {...props}
            />
          )}
        </FormField>
        <div>
          <Button variant="primary" onClick={saveDefaults}>Save defaults</Button>
        </div>
      </Section>
    </TabBody>
  );
}

/* ============================================================
 * Drive — root, free space, eject, auto-launch, stats
 * ============================================================ */

function DriveTab() {
  const { driveRoot } = useSession();
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [autoLaunchInstalled, setAutoLaunchInstalled] = useState<boolean | null>(null);
  const [autoLaunchBusy, setAutoLaunchBusy] = useState(false);

  useEffect(() => {
    void invoke<HealthReport>("health", { driveRoot }).then(setHealth).catch(() => {});
    void invoke<Stats>("stats", { driveRoot }).then(setStats).catch(() => {});
    void invoke<boolean>("is_auto_launch_installed").then(setAutoLaunchInstalled).catch(() => setAutoLaunchInstalled(false));
  }, [driveRoot]);

  const toggleAutoLaunch = async () => {
    setAutoLaunchBusy(true);
    try {
      if (autoLaunchInstalled) await invoke("uninstall_auto_launch");
      else await invoke("install_auto_launch");
      setAutoLaunchInstalled(!autoLaunchInstalled);
      notify.ok(autoLaunchInstalled ? "Auto-launch removed" : "Auto-launch installed");
    } catch (e) {
      notify.err("Couldn't change auto-launch", e);
    } finally { setAutoLaunchBusy(false); }
  };

  return (
    <TabBody title="Drive">
      <Section title="This drive">
        <div className="arasul-kv">
          <div><span>Mount point</span><span>{driveRoot}</span></div>
          {health && <div><span>Free space</span><span>{health.drive_free_mb.toLocaleString()} MB</span></div>}
          {stats && <div><span>Projects</span><span>{stats.projects}</span></div>}
          {stats && <div><span>Notes</span><span>{stats.notes}</span></div>}
          {stats && <div><span>Lines of markdown</span><span>{stats.lines.toLocaleString()}</span></div>}
        </div>
      </Section>

      <Section title="Auto-launch on this Mac">
        <p className="text-[length:var(--text-body-sm)] text-fg-muted m-0">
          When enabled, plugging this drive into this Mac opens Arasul automatically.
          Per-computer setting — you can install or remove it any time.
        </p>
        <div>
          <Button
            variant="primary"
            onClick={toggleAutoLaunch}
            loading={autoLaunchBusy}
            disabled={autoLaunchBusy || autoLaunchInstalled === null}
          >
            {autoLaunchBusy ? "Working" :
             autoLaunchInstalled === null ? "Checking" :
             autoLaunchInstalled ? "Remove auto-launch" : "Install auto-launch"}
          </Button>
        </div>
      </Section>

      {health && (
        <Section title="Health">
          <div className="arasul-kv">
            <div>
              <span>Vault present</span>
              <Badge tone={health.vault_present ? "success" : "danger"}>
                {health.vault_present ? "Yes" : "No"}
              </Badge>
            </div>
            <div>
              <span>Claude binary</span>
              <Badge tone={health.claude_binary_present ? "success" : "warning"}>
                {health.claude_binary_present ? "Yes" : "No"}
              </Badge>
            </div>
            <div>
              <span>Memory consistent</span>
              <Badge tone={health.memory_consistent ? "success" : "warning"}>
                {health.memory_consistent ? "Yes" : "No"}
              </Badge>
            </div>
          </div>
          {health.issues.length > 0 && (
            <>
              <h3 className="text-[length:var(--text-caption)] font-medium text-fg uppercase tracking-wide m-0 mt-3">
                Issues
              </h3>
              <ul className="pl-6 m-0 text-[length:var(--text-body-sm)] text-danger leading-[1.6]">
                {health.issues.map((i) => <li key={i}>{i}</li>)}
              </ul>
            </>
          )}
        </Section>
      )}
    </TabBody>
  );
}

/* ============================================================
 * Vault — change passphrase, auto-lock timeout, lock now
 * ============================================================ */

function VaultTab() {
  const { lock, state, driveRoot } = useSession();
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [autoLockMin, setAutoLockMin] = useState<number>(0);

  useEffect(() => {
    void invoke<{ vault?: { auto_lock_minutes?: number } }>("get_config", { driveRoot })
      .then((cfg) => { if (cfg.vault?.auto_lock_minutes !== undefined) setAutoLockMin(cfg.vault.auto_lock_minutes); })
      .catch(() => {});
  }, [driveRoot]);

  const changePassphrase = async () => {
    setError(null);
    if (newPw !== confirm) { setError("Passphrases don't match."); return; }
    if (newPw.length < 4) { setError("Use at least 4 characters."); return; }
    try {
      await invoke("vault_change_passphrase", { driveRoot, old: oldPw, new: newPw });
      setOldPw(""); setNewPw(""); setConfirm("");
      notify.ok("Passphrase changed", "Please unlock again.");
      await lock();
    } catch (e) {
      notify.err("Couldn't change passphrase", e);
    }
  };

  const saveAutoLock = async () => {
    try {
      await invoke("set_config", { driveRoot, patch: { vault: { auto_lock_minutes: autoLockMin } } });
      notify.ok("Auto-lock saved");
    } catch (e) {
      notify.err("Couldn't save", e);
    }
  };

  const lockOption = (n: number) =>
    n === 0 ? "Never" : n === 60 ? "1 hour" : `${n} minutes`;

  return (
    <TabBody title="Vault">
      <Section title="Change passphrase">
        <FormField label="Current passphrase">
          {(props) => (
            <Input
              type="password"
              value={oldPw}
              onChange={(e) => setOldPw(e.target.value)}
              autoComplete="current-password"
              {...props}
            />
          )}
        </FormField>
        <FormField label="New passphrase" error={error && newPw.length < 4 ? error : undefined}>
          {(props) => (
            <Input
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              autoComplete="new-password"
              {...props}
            />
          )}
        </FormField>
        <FormField
          label="Confirm new passphrase"
          error={error && newPw === confirm ? undefined : error && confirm.length > 0 ? error : undefined}
        >
          {(props) => (
            <Input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              {...props}
            />
          )}
        </FormField>
        <div>
          <Button
            variant="primary"
            onClick={changePassphrase}
            disabled={!oldPw || !newPw || !confirm || state.status !== "unlocked"}
          >
            Change passphrase
          </Button>
        </div>
      </Section>

      <Section title="Auto-lock">
        <p className="text-[length:var(--text-body-sm)] text-fg-muted m-0">
          Automatically lock the drive after this many minutes of inactivity. Useful on shared computers.
        </p>
        <FormField label="Lock after">
          {(props) => (
            <Select
              value={String(autoLockMin)}
              onValueChange={(v) => setAutoLockMin(Number(v))}
            >
              <SelectTrigger id={props.id}>{lockOption(autoLockMin)}</SelectTrigger>
              <SelectContent>
                {[0, 5, 15, 30, 60].map((n) => (
                  <SelectItem key={n} value={String(n)}>{lockOption(n)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
        <div>
          <Button variant="primary" onClick={saveAutoLock}>Save</Button>
        </div>
      </Section>

      <Section title="Lock now">
        <p className="text-[length:var(--text-body-sm)] text-fg-muted m-0">
          Closes your session. Plaintext is zeroed. Shortcut: ⌘L.
        </p>
        <div>
          <Button variant="ghost" onClick={() => void lock()}>Lock drive</Button>
        </div>
      </Section>
    </TabBody>
  );
}

/* ============================================================
 * Privacy — reassurance pane (readonly)
 * ============================================================ */

function PrivacyTab() {
  return (
    <TabBody title="Privacy">
      <p className="text-[length:var(--text-body-sm)] text-fg-muted m-0">
        Arasul is a local-first app. Your files, your projects, your drive lock — all stay on the SSD
        you're holding. There are no Arasul servers. There is no telemetry.
      </p>

      <Section title="What goes over the network">
        <ul className="pl-6 m-0 text-[length:var(--text-body-sm)] text-fg-muted leading-[1.6] flex flex-col gap-2">
          <li>
            <strong>Claude requests.</strong> When you ask Claude something, your prompt
            (and any context you add) is sent to <code>api.anthropic.com</code> — that's
            how AI works. We don't sit in the middle.
          </li>
          <li>
            <strong>Update checks.</strong> Once per app launch, Arasul asks
            GitHub Releases <em>"is there a new version?"</em>. No tracking ID, no
            user data, just the public release feed.
          </li>
          <li>
            <strong>GitHub commit/push</strong> (when you use it). Goes to <code>github.com</code>.
          </li>
        </ul>
      </Section>

      <Section title="What never leaves your drive">
        <ul className="pl-6 m-0 text-[length:var(--text-body-sm)] text-fg-muted leading-[1.6] flex flex-col gap-2">
          <li>Your drive-lock passphrase.</li>
          <li>Your files, projects, and notes.</li>
          <li>Your editor history, cursor positions, local shell history.</li>
          <li>Crash logs (none collected; they're local console output).</li>
        </ul>
      </Section>

      <Section title="Vault crypto">
        <p className="text-[length:var(--text-body-sm)] text-fg-muted m-0">
          Argon2id key derivation (64 MB memory, 3 iterations) + XChaCha20-Poly1305 AEAD.
          Same family as 1Password and modern wallets. See <code>docs/vault-decision.md</code>.
        </p>
      </Section>
    </TabBody>
  );
}

/* ============================================================
 * Updates
 * ============================================================ */

function UpdatesTab() {
  const { driveRoot } = useSession();
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [busy, setBusy] = useState(false);

  const check = async () => {
    setBusy(true);
    try { setInfo(await invoke<UpdateInfo>("check_for_update")); }
    finally { setBusy(false); }
  };

  useEffect(() => { void check(); }, []);

  return (
    <TabBody title="Updates">
      {info ? (
        <div className="arasul-kv">
          <div><span>Current</span><span>{info.current_version}</span></div>
          <div><span>Latest</span><span>{info.latest_version}</span></div>
          <div>
            <span>Status</span>
            {info.update_available ? (
              <Badge tone="accent">Update available</Badge>
            ) : (
              <Badge tone="success">Up to date</Badge>
            )}
          </div>
        </div>
      ) : (
        <p className="text-[length:var(--text-body-sm)] text-fg-muted">Checking…</p>
      )}

      <div className="flex gap-2 mt-2">
        <Button variant="ghost" onClick={check} loading={busy}>
          {busy ? "Checking" : "Check again"}
        </Button>
        {info?.update_available && info.download_url && (
          <Button
            variant="primary"
            onClick={() => {
              void invoke("download_and_stage_update", { driveRoot })
                .then(() => notify.ok("Update downloaded", "Restart Arasul to apply."))
                .catch((e) => notify.err("Update failed", e));
            }}
          >
            Download
          </Button>
        )}
      </div>
    </TabBody>
  );
}

/* ============================================================
 * About
 * ============================================================ */

function AboutTab() {
  return (
    <TabBody title="About">
      <p className="text-[length:var(--text-body)] text-fg m-0">
        Arasul — a portable AI workspace on a USB-C SSD.
      </p>
      <p className="text-[length:var(--text-body-sm)] text-fg-muted m-0">
        Open-source (MIT) ·{" "}
        <a className="text-accent hover:underline" href="https://arasul.dev">arasul.dev</a> ·{" "}
        <a className="text-accent hover:underline" href="https://github.com/arasul/arasul">source</a>.
      </p>
      <p className="text-[length:var(--text-body-sm)] text-fg-muted m-0">
        Built with Tauri 2, React, Rust. Vault crypto: Argon2id + XChaCha20-Poly1305.
        See <code>docs/vault-decision.md</code> for the design rationale.
      </p>
    </TabBody>
  );
}

/* ============================================================
 * Helpers
 * ============================================================ */

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2.5 cursor-pointer select-none text-[length:var(--text-body-sm)] text-fg w-fit">
      <Switch checked={checked} onCheckedChange={onChange} />
      <span>{label}</span>
    </label>
  );
}
