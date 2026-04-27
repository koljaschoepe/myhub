import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSession } from "../lib/session";
import { getTheme, setTheme, type ThemeChoice } from "../lib/theme";
import { getDensity, setDensity, type DensityChoice } from "../lib/density";
import { useFocusTrap } from "../lib/useFocusTrap";
import { notify } from "../lib/toast";
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
  vault:      "Vault",
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
 * Open via ⌘, or the palette → "Settings". Each tab is a thin component
 * wired to `get_config` / `set_config` (Rust merges JSON patches into
 * `memory/config.toml` at the drive root).
 */
export function Settings({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("general");
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);
  return (
    <div className="arasul-settings-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className="arasul-settings"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <aside className="arasul-settings-sidebar">
          <div id="settings-title" className="arasul-settings-title">Settings</div>
          {TAB_ORDER.map((t) => (
            <button
              key={t}
              type="button"
              className={"arasul-settings-tab" + (t === tab ? " active" : "")}
              onClick={() => setTab(t)}
            >
              {LABELS[t]}
            </button>
          ))}
          <div className="arasul-settings-spacer" />
          <button type="button" className="arasul-btn ghost" onClick={onClose}>Close</button>
        </aside>
        <main className="arasul-settings-body">
          {tab === "general"    && <GeneralTab />}
          {tab === "appearance" && <AppearanceTab />}
          {tab === "editor"     && <EditorTab />}
          {tab === "terminal"   && <TerminalTab />}
          {tab === "claude"     && <ClaudeTab />}
          {tab === "github"     && <GithubTab />}
          {tab === "drive"      && <DriveTab />}
          {tab === "vault"      && <VaultTab />}
          {tab === "privacy"    && <PrivacyTab />}
          {tab === "updates"    && <UpdatesTab />}
          {tab === "about"      && <AboutTab />}
        </main>
      </div>
    </div>
  );
}

// ============================================================
// General — name, default shell
// ============================================================

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
    <div className="arasul-settings-tab-body">
      <h2>General</h2>
      <label>Your name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
      </label>
      <label>Default shell
        <select value={defaultShell} onChange={(e) => setDefaultShell(e.target.value)}>
          <option>bash</option>
          <option>zsh</option>
          <option>fish</option>
          <option>powershell.exe</option>
        </select>
      </label>
      <button type="button" className="arasul-btn primary" onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

// ============================================================
// Appearance — theme, density (live; persisted in localStorage)
// ============================================================

function AppearanceTab() {
  const [theme, setThemeState] = useState<ThemeChoice>(() => getTheme());
  const [density, setDensityState] = useState<DensityChoice>(() => getDensity());

  return (
    <div className="arasul-settings-tab-body">
      <h2>Appearance</h2>

      <section>
        <h3>Theme</h3>
        <p className="arasul-muted">System matches your Mac's light/dark setting and switches automatically.</p>
        <div className="arasul-theme-group" role="radiogroup" aria-label="Theme">
          {(["system", "dark", "light"] as ThemeChoice[]).map((opt) => (
            <button
              key={opt}
              type="button"
              role="radio"
              aria-checked={theme === opt}
              className={"arasul-theme-opt" + (theme === opt ? " active" : "")}
              onClick={() => { setThemeState(opt); setTheme(opt); }}
            >
              {opt === "system" ? "System" : opt === "dark" ? "Dark" : "Light"}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3>UI density</h3>
        <p className="arasul-muted">Tighten or loosen spacing across the whole app. Useful on small laptops.</p>
        <div className="arasul-theme-group" role="radiogroup" aria-label="Density">
          {(["compact", "normal", "spacious"] as DensityChoice[]).map((opt) => (
            <button
              key={opt}
              type="button"
              role="radio"
              aria-checked={density === opt}
              className={"arasul-theme-opt" + (density === opt ? " active" : "")}
              onClick={() => { setDensityState(opt); setDensity(opt); }}
            >
              {opt[0].toUpperCase() + opt.slice(1)}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

// ============================================================
// Editor — font size, line numbers, word wrap (persisted)
// ============================================================

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
    <div className="arasul-settings-tab-body">
      <h2>Editor</h2>
      <label>Font size
        <select
          value={prefs.font_size}
          onChange={(e) => setPrefs({ ...prefs, font_size: Number(e.target.value) })}
        >
          {[12, 13, 14, 15, 16, 18, 20].map((n) => <option key={n} value={n}>{n} px</option>)}
        </select>
      </label>
      <label>Default view
        <select
          value={prefs.default_view}
          onChange={(e) => setPrefs({ ...prefs, default_view: e.target.value as EditorPrefs["default_view"] })}
        >
          <option value="wysiwyg">WYSIWYG (formatted)</option>
          <option value="source">Source (raw markdown)</option>
        </select>
      </label>
      <Toggle
        label="Show line numbers in code editor"
        checked={prefs.line_numbers}
        onChange={(v) => setPrefs({ ...prefs, line_numbers: v })}
      />
      <Toggle
        label="Wrap long lines"
        checked={prefs.word_wrap}
        onChange={(v) => setPrefs({ ...prefs, word_wrap: v })}
      />
      <button type="button" className="arasul-btn primary" onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

// ============================================================
// Terminal — font size, default cols/rows (persisted)
// ============================================================

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

  return (
    <div className="arasul-settings-tab-body">
      <h2>Terminal</h2>
      <p className="arasul-muted">Defaults applied to new terminal tabs. Existing tabs stay as they are.</p>
      <label>Font size
        <select
          value={prefs.font_size}
          onChange={(e) => setPrefs({ ...prefs, font_size: Number(e.target.value) })}
        >
          {[11, 12, 13, 14, 15, 16].map((n) => <option key={n} value={n}>{n} px</option>)}
        </select>
      </label>
      <label>Default columns
        <select value={prefs.cols} onChange={(e) => setPrefs({ ...prefs, cols: Number(e.target.value) })}>
          {[80, 100, 120, 140, 160, 200].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <label>Default rows
        <select value={prefs.rows} onChange={(e) => setPrefs({ ...prefs, rows: Number(e.target.value) })}>
          {[20, 24, 30, 40, 50].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <label>Scrollback (lines)
        <select value={prefs.scrollback} onChange={(e) => setPrefs({ ...prefs, scrollback: Number(e.target.value) })}>
          {[500, 1000, 2500, 5000, 10000].map((n) => <option key={n} value={n}>{n.toLocaleString()}</option>)}
        </select>
      </label>
      <button type="button" className="arasul-btn primary" onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

// ============================================================
// Claude AI — model, temperature, system prompt (persisted)
// ============================================================

type ClaudePrefs = {
  model: string;
  temperature: number;
  system_prompt: string;
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
    <div className="arasul-settings-tab-body">
      <h2>Claude AI</h2>
      <p className="arasul-muted">
        Settings used when Arasul talks to Claude. Defaults are tuned for general writing
        and code work.
      </p>

      <label>Model
        <select value={prefs.model} onChange={(e) => setPrefs({ ...prefs, model: e.target.value })}>
          <option value="claude-opus-4-7">Opus 4.7 — most capable</option>
          <option value="claude-sonnet-4-6">Sonnet 4.6 — fast + balanced</option>
          <option value="claude-haiku-4-5-20251001">Haiku 4.5 — fastest, lowest cost</option>
        </select>
      </label>

      <label>Temperature
        <input
          type="range" min={0} max={2} step={0.1}
          value={prefs.temperature}
          onChange={(e) => setPrefs({ ...prefs, temperature: Number(e.target.value) })}
        />
      </label>
      <p className="arasul-muted" style={{ marginTop: -4 }}>
        <code>{prefs.temperature.toFixed(1)}</code> — lower means consistent answers,
        higher means more creative variation. <strong>1.0</strong> is a good default.
      </p>

      <label>Custom system prompt (optional)
        <textarea
          rows={4}
          value={prefs.system_prompt}
          onChange={(e) => setPrefs({ ...prefs, system_prompt: e.target.value })}
          placeholder="e.g. 'You are a helpful writing assistant. Be concise.'"
        />
      </label>

      <button type="button" className="arasul-btn primary" onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

// ============================================================
// GitHub — token + commit message template
// ============================================================

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
    <div className="arasul-settings-tab-body">
      <h2>GitHub</h2>
      <p className="arasul-muted">
        Connect your GitHub account once — projects can then be pushed/pulled with one click,
        and creating a new project automatically provisions a private repo.
      </p>

      {account ? (
        <section>
          <h3>Connected</h3>
          <div className="arasul-kv">
            <div><span>Login</span><span>{account.login}</span></div>
            {account.name && <div><span>Name</span><span>{account.name}</span></div>}
          </div>
          <div className="arasul-actions">
            <button type="button" className="arasul-btn ghost" onClick={disconnect} disabled={busy}>
              Disconnect
            </button>
          </div>
        </section>
      ) : (
        <section>
          <h3>Personal Access Token</h3>
          <p className="arasul-muted">
            Create one at{" "}
            <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">
              github.com → Settings → Developer settings → Fine-grained tokens
            </a>{" "}
            with the following permissions:
          </p>
          <ul className="arasul-muted">
            <li>Repository · Contents · <strong>Read &amp; Write</strong></li>
            <li>Repository · Metadata · <strong>Read</strong></li>
            <li>Account · Administration · <strong>Read &amp; Write</strong> <em>(for repo creation)</em></li>
          </ul>
          <label>Token
            <input
              type="password" value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="github_pat_…" autoComplete="off" spellCheck={false}
            />
          </label>
          <button type="button" className="arasul-btn primary" onClick={connect} disabled={busy || !token.trim() || !handle}>
            {busy ? "Checking…" : "Connect"}
          </button>
        </section>
      )}

      <section>
        <h3>Defaults for new projects</h3>
        <Toggle
          label="Auto-create new GitHub repos as private"
          checked={defaultPrivate}
          onChange={setDefaultPrivate}
        />
        <label>Commit message template
          <input
            value={commitTemplate}
            onChange={(e) => setCommitTemplate(e.target.value)}
            placeholder="Update from Arasul · {ts}"
          />
        </label>
        <p className="arasul-muted">
          Use <code>{"{ts}"}</code> for the timestamp. Used when you click Push without typing a message.
        </p>
        <button type="button" className="arasul-btn primary" onClick={saveDefaults}>Save defaults</button>
      </section>
    </div>
  );
}

// ============================================================
// Drive — root, free space, eject, auto-launch, stats (absorbs Memory tab)
// ============================================================

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
    <div className="arasul-settings-tab-body">
      <h2>Drive</h2>

      <section>
        <h3>This drive</h3>
        <div className="arasul-kv">
          <div><span>Mount point</span><span>{driveRoot}</span></div>
          {health && <div><span>Free space</span><span>{health.drive_free_mb.toLocaleString()} MB</span></div>}
          {stats && <div><span>Projects</span><span>{stats.projects}</span></div>}
          {stats && <div><span>Notes</span><span>{stats.notes}</span></div>}
          {stats && <div><span>Lines of markdown</span><span>{stats.lines.toLocaleString()}</span></div>}
        </div>
      </section>

      <section>
        <h3>Auto-launch on this Mac</h3>
        <p className="arasul-muted">
          When enabled, plugging this drive into this Mac opens Arasul automatically.
          Per-computer setting — you can install or remove it any time.
        </p>
        <button type="button" className="arasul-btn primary" onClick={toggleAutoLaunch}
                disabled={autoLaunchBusy || autoLaunchInstalled === null}>
          {autoLaunchBusy ? "Working…" :
           autoLaunchInstalled === null ? "Checking…" :
           autoLaunchInstalled ? "Remove auto-launch" : "Install auto-launch"}
        </button>
      </section>

      {health && (
        <section>
          <h3>Health</h3>
          <div className="arasul-kv">
            <div><span>Vault present</span><span>{health.vault_present ? "yes" : "no"}</span></div>
            <div><span>Claude binary</span><span>{health.claude_binary_present ? "yes" : "no"}</span></div>
            <div><span>Memory consistent</span><span>{health.memory_consistent ? "yes" : "no"}</span></div>
          </div>
          {health.issues.length > 0 && (
            <>
              <h3>Issues</h3>
              <ul>{health.issues.map((i) => <li key={i}>{i}</li>)}</ul>
            </>
          )}
        </section>
      )}
    </div>
  );
}

// ============================================================
// Vault — change passphrase, auto-lock timeout, lock now
// ============================================================

function VaultTab() {
  const { lock, state, driveRoot } = useSession();
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [autoLockMin, setAutoLockMin] = useState<number>(0); // 0 = never

  useEffect(() => {
    void invoke<{ vault?: { auto_lock_minutes?: number } }>("get_config", { driveRoot })
      .then((cfg) => { if (cfg.vault?.auto_lock_minutes !== undefined) setAutoLockMin(cfg.vault.auto_lock_minutes); })
      .catch(() => {});
  }, [driveRoot]);

  const changePassphrase = async () => {
    setMsg(null);
    if (newPw !== confirm) { setMsg("Passphrases don't match."); return; }
    if (newPw.length < 4) { setMsg("At least 4 characters."); return; }
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

  return (
    <div className="arasul-settings-tab-body">
      <h2>Vault</h2>

      <section>
        <h3>Change passphrase</h3>
        <label>Current passphrase
          <input type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} />
        </label>
        <label>New passphrase
          <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
        </label>
        <label>Confirm new passphrase
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        {msg && <div className="arasul-error">{msg}</div>}
        <button type="button" className="arasul-btn primary" onClick={changePassphrase}
                disabled={!oldPw || !newPw || !confirm || state.status !== "unlocked"}>
          Change passphrase
        </button>
      </section>

      <section>
        <h3>Auto-lock</h3>
        <p className="arasul-muted">
          Automatically lock the vault after this many minutes of inactivity. Useful on shared computers.
        </p>
        <label>Lock after
          <select value={autoLockMin} onChange={(e) => setAutoLockMin(Number(e.target.value))}>
            <option value={0}>Never</option>
            <option value={5}>5 minutes</option>
            <option value={15}>15 minutes</option>
            <option value={30}>30 minutes</option>
            <option value={60}>1 hour</option>
          </select>
        </label>
        <button type="button" className="arasul-btn primary" onClick={saveAutoLock}>Save</button>
      </section>

      <section>
        <h3>Lock now</h3>
        <p className="arasul-muted">Closes your session. Plaintext is zeroed. Shortcut: ⌘L.</p>
        <button type="button" className="arasul-btn ghost" onClick={() => void lock()}>Lock vault</button>
      </section>
    </div>
  );
}

// ============================================================
// Privacy — reassurance pane
// ============================================================

function PrivacyTab() {
  return (
    <div className="arasul-settings-tab-body">
      <h2>Privacy</h2>
      <p className="arasul-muted">
        Arasul is a local-first app. Your files, your projects, your vault — all stay on the SSD
        you're holding. There are no Arasul servers. There is no telemetry.
      </p>

      <section>
        <h3>What goes over the network</h3>
        <ul className="arasul-muted">
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
      </section>

      <section>
        <h3>What never leaves your drive</h3>
        <ul className="arasul-muted">
          <li>Your vault passphrase.</li>
          <li>Your files, projects, and notes.</li>
          <li>Your editor history, cursor positions, local shell history.</li>
          <li>Crash logs (none collected; they're local console output).</li>
        </ul>
      </section>

      <section>
        <h3>Vault crypto</h3>
        <p className="arasul-muted">
          Argon2id key derivation (64 MB memory, 3 iterations) + XChaCha20-Poly1305 AEAD.
          Same family as 1Password and modern wallets. See <code>docs/vault-decision.md</code>.
        </p>
      </section>
    </div>
  );
}

// ============================================================
// Updates — existing
// ============================================================

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
    <div className="arasul-settings-tab-body">
      <h2>Updates</h2>
      {info ? (
        <div className="arasul-kv">
          <div><span>Current</span><span>{info.current_version}</span></div>
          <div><span>Latest</span><span>{info.latest_version}</span></div>
          <div><span>Status</span>
            <span>{info.update_available ? "Update available" : "Up to date"}</span>
          </div>
        </div>
      ) : <div className="arasul-muted">Checking…</div>}

      <div className="arasul-actions">
        <button type="button" className="arasul-btn ghost" onClick={check} disabled={busy}>
          {busy ? "Checking…" : "Check again"}
        </button>
        {info?.update_available && info.download_url && (
          <button type="button" className="arasul-btn primary" onClick={() => {
            void invoke("download_and_stage_update", { driveRoot })
              .then(() => notify.ok("Update downloaded", "Restart Arasul to apply."))
              .catch((e) => notify.err("Update failed", e));
          }}>Download</button>
        )}
      </div>
    </div>
  );
}

// ============================================================
// About — existing
// ============================================================

function AboutTab() {
  return (
    <div className="arasul-settings-tab-body">
      <h2>About</h2>
      <p>Arasul — a portable AI workspace on a USB-C SSD.</p>
      <p className="arasul-muted">
        Open-source (MIT) · <a href="https://arasul.dev">arasul.dev</a> ·{" "}
        <a href="https://github.com/arasul/arasul">source</a>.
      </p>
      <p className="arasul-muted">
        Built with Tauri 2, React, Rust. Vault crypto: Argon2id + XChaCha20-Poly1305.
        See <code>docs/vault-decision.md</code> for the design rationale.
      </p>
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="arasul-toggle-row">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
