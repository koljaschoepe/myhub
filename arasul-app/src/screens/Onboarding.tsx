import { useState, useEffect, useRef, useCallback } from "react";
import { zxcvbn, zxcvbnOptions } from "@zxcvbn-ts/core";
import * as zxcvbnCommonPackage from "@zxcvbn-ts/language-common";
import * as zxcvbnEnPackage from "@zxcvbn-ts/language-en";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { ArrowLeft, ArrowUpFromLine, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useSession } from "../lib/session";
import { notify } from "../lib/toast";
import {
  Button,
  Input,
  IconButton,
  Switch,
  Badge,
  FormField,
} from "../components/ui";
import "./Onboarding.css";

const STEP_ORDER = ["welcome", "passphrase", "claude", "auto-launch"] as const;
const STEP_LABEL: Record<(typeof STEP_ORDER)[number], string> = {
  welcome: "Welcome",
  passphrase: "Set passphrase",
  claude: "Connect Claude",
  "auto-launch": "Auto-launch",
};

zxcvbnOptions.setOptions({
  translations: zxcvbnEnPackage.translations,
  graphs: zxcvbnCommonPackage.adjacencyGraphs,
  dictionary: { ...zxcvbnCommonPackage.dictionary, ...zxcvbnEnPackage.dictionary },
});

/**
 * D7 + Phase 4 onboarding: 4 steps.
 *   1. Welcome + name
 *   2. Passphrase + confirm + zxcvbn meter
 *   3. Connect Claude — orchestrates Anthropic's official curl-installer if
 *      claude CLI is missing. We never ship the binary; we never touch the
 *      OAuth token. The user logs in inside the embedded PTY on first chat.
 *   4. Auto-launch opt-in.
 *
 * Phase 1.7 (2026-05-11) — migrated to ui/ primitives. Dropped
 * `useFocusTrap` (the full-screen card is the only thing visible during
 * onboarding, so a trap adds nothing). Added show/hide password toggle
 * (Phase 4.2 quick win).
 */
type Step = "welcome" | "passphrase" | "claude" | "auto-launch";

type ClaudeInstallStatus = {
  installed: boolean;
  version: string | null;
  path: string | null;
};

type InstallChunk = {
  delta?: string;
  stream?: "stderr";
  done?: boolean;
  ok?: boolean;
  exit_code?: number | null;
  resolved_path?: string | null;
};

export function Onboarding() {
  const { create, driveRoot } = useSession();
  const [step, setStep] = useState<Step>("welcome");
  const [name, setName] = useState("");
  // Phase 4.6 (2026-05-11): jobs-based first question. The drive feels
  // more useful when you commit to a use case up front; the chip choice
  // is persisted under `arasul.onboarding.intent` so future steps (sample
  // workspace seeding, default folder) can read it without a roundtrip.
  const [intent, setIntent] = useState<string>("");
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [strength, setStrength] = useState<{ score: number; feedback?: string } | null>(null);
  const [autoLaunch, setAutoLaunch] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Phase 4.3: caps-lock detector for passphrase fields.
  const [capsLock, setCapsLock] = useState(false);

  // Phase 4 — Claude install state.
  const [claudeStatus, setClaudeStatus] = useState<ClaudeInstallStatus | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installLog, setInstallLog] = useState<string>("");
  const [installResult, setInstallResult] = useState<"ok" | "fail" | null>(null);
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (!passphrase) { setStrength(null); return; }
    const r = zxcvbn(passphrase);
    setStrength({
      score: r.score,
      feedback: r.feedback.warning || r.feedback.suggestions[0],
    });
  }, [passphrase]);

  // Probe claude install status when entering the claude step.
  useEffect(() => {
    if (step !== "claude") return;
    void (async () => {
      try {
        const s = await invoke<ClaudeInstallStatus>("claude_install_status");
        setClaudeStatus(s);
      } catch (e) {
        // Treat probe failure as "not installed" — user can still skip.
        setClaudeStatus({ installed: false, version: null, path: null });
        console.warn("claude_install_status failed:", e);
      }
    })();
  }, [step]);

  // Auto-scroll install log to bottom on every new chunk.
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [installLog]);

  const next = () => {
    const i = STEP_ORDER.indexOf(step);
    setStep(STEP_ORDER[Math.min(i + 1, STEP_ORDER.length - 1)]);
    setError(null);
  };

  // Phase 4.5: lets users walk backwards through the wizard. Form state
  // is held at the component level so name/passphrase/etc. all survive.
  const back = () => {
    const i = STEP_ORDER.indexOf(step);
    if (i <= 0) return;
    setStep(STEP_ORDER[i - 1]);
    setError(null);
  };

  const stepIndex = STEP_ORDER.indexOf(step);
  const canGoBack = stepIndex > 0;

  const checkCapsLock = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    setCapsLock(e.getModifierState?.("CapsLock") ?? false);
  }, []);

  const finishPassphrase = async () => {
    setError(null);
    if (passphrase.length < 4) { setError("Use at least 4 characters."); return; }
    if (passphrase !== confirm) { setError("Passphrases don't match."); return; }
    setBusy(true);
    try {
      await create(passphrase);
      try {
        await invoke("set_config", { driveRoot, patch: { general: { name } } });
      } catch { /* best-effort; missing config is fine */ }
      next();
    } catch (e) {
      setError(`Couldn't set up the drive lock: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const installClaude = async () => {
    setInstalling(true);
    setInstallLog("");
    setInstallResult(null);
    let unlisten: UnlistenFn | null = null;
    try {
      const channel = await invoke<string>("claude_install");
      unlisten = await listen<InstallChunk>(channel, (event) => {
        const chunk = event.payload;
        if (chunk.delta) {
          setInstallLog((prev) => prev + chunk.delta);
        }
        if (chunk.done) {
          setInstallResult(chunk.ok ? "ok" : "fail");
          if (chunk.ok) {
            setClaudeStatus({
              installed: true,
              version: null,
              path: chunk.resolved_path ?? null,
            });
            // Re-probe to pick up the version string.
            void invoke<ClaudeInstallStatus>("claude_install_status")
              .then((s) => setClaudeStatus(s))
              .catch(() => { /* keep optimistic state */ });
          }
          setInstalling(false);
        }
      });
    } catch (e) {
      setInstallLog((prev) => prev + `\nFailed to start installer: ${String(e)}\n`);
      setInstallResult("fail");
      setInstalling(false);
    }
    return () => { if (unlisten) unlisten(); };
  };

  const finishAutoLaunch = async () => {
    setBusy(true);
    try {
      if (autoLaunch) {
        await invoke("install_auto_launch").catch((e) => {
          console.warn("auto-launch install failed:", e);
          notify.err("Couldn't install auto-launch", e);
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const passwordToggle = (
    <IconButton
      type="button"
      label={showPassword ? "Hide passphrase" : "Show passphrase"}
      variant="ghost"
      size="sm"
      showTooltip={false}
      onClick={() => setShowPassword((v) => !v)}
      tabIndex={-1}
    >
      {showPassword ? <EyeOff /> : <Eye />}
    </IconButton>
  );

  return (
    <div className="arasul-onboarding">
      <div
        className="arasul-onboarding-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        tabIndex={-1}
      >
        {/* Phase 4.5: step indicator + back nav. Back is disabled on
            step 1 so first-run users can't escape into a no-state limbo. */}
        <div className="arasul-onboarding-header">
          <button
            type="button"
            className="arasul-onboarding-back"
            onClick={back}
            disabled={!canGoBack || busy || installing}
            aria-label="Go back to previous step"
            title="Back"
          >
            <ArrowLeft size={14} aria-hidden="true" />
          </button>
          <div className="arasul-onboarding-step" aria-live="polite">
            Step {stepIndex + 1} of {STEP_ORDER.length}
            <span className="arasul-onboarding-step-sep"> · </span>
            <span className="arasul-onboarding-step-label">{STEP_LABEL[step]}</span>
          </div>
        </div>

        {step === "welcome" && (
          <>
            <div id="onboarding-title" className="arasul-brand-hero">Arasul</div>
            <p className="text-fg-muted">A portable AI workspace on a drive you carry.</p>

            {/* Phase 4.6 (2026-05-11): jobs-based first question. Frames
                the workspace around the user's goal, not just their name.
                The chip choice gates the Continue button alongside the
                name input — both are quick and feel intentional. */}
            <fieldset className="arasul-intent-group">
              <legend>What brings you here?</legend>
              <div className="arasul-intent-chips" role="radiogroup" aria-label="Primary use">
                {[
                  { id: "write",     label: "Write & research" },
                  { id: "code",      label: "Code projects" },
                  { id: "knowledge", label: "Personal knowledge" },
                  { id: "explore",   label: "Just exploring" },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={intent === opt.id}
                    className={"arasul-intent-chip" + (intent === opt.id ? " active" : "")}
                    onClick={() => {
                      setIntent(opt.id);
                      try { localStorage.setItem("arasul.onboarding.intent", opt.id); } catch {}
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <FormField label="What should we call you?">
              {(props) => (
                <Input
                  size="lg"
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && name.trim() && intent) next(); }}
                  {...props}
                />
              )}
            </FormField>

            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={next}
              disabled={!name.trim() || !intent}
            >
              Continue
            </Button>
          </>
        )}

        {step === "passphrase" && (
          <>
            <h2>Set a passphrase, {name.split(" ")[0] || "friend"}.</h2>
            <p className="arasul-muted">
              This protects your AI access on the drive. You'll enter it when you reconnect this drive.
              Write it down somewhere safe — we can't reset it. Your files stay safe either way.
            </p>

            {/* Phase 4.9: trust callout. Specific about WHO sees WHAT —
                non-coder research showed vague "no cloud" copy doesn't
                land; explicit endpoint names build more confidence. */}
            <div className="arasul-trust-callout">
              <ShieldCheck size={16} aria-hidden="true" />
              <div>
                <strong>Your data stays on this drive.</strong>
                <p>
                  Files, settings, and chat history are written only to the
                  USB-C SSD in your hand. The only thing that goes over the
                  network is your Claude prompts — straight to{" "}
                  <code>api.anthropic.com</code> on your own subscription.
                </p>
              </div>
            </div>

            <FormField label="Passphrase">
              {(props) => (
                <Input
                  size="lg"
                  type={showPassword ? "text" : "password"}
                  placeholder="Passphrase"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  onKeyDown={checkCapsLock}
                  onKeyUp={checkCapsLock}
                  autoFocus
                  autoComplete="new-password"
                  trailing={passwordToggle}
                  {...props}
                />
              )}
            </FormField>

            {strength && (
              <div className="arasul-strength">
                <div className={`arasul-strength-bar score-${strength.score}`} />
                <span>{["too weak", "weak", "fair", "good", "strong"][strength.score]}</span>
                {strength.feedback && <span className="arasul-muted">· {strength.feedback}</span>}
              </div>
            )}

            <FormField label="Confirm passphrase" error={error ?? undefined}>
              {(props) => (
                <Input
                  size="lg"
                  type={showPassword ? "text" : "password"}
                  placeholder="Confirm passphrase"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  onKeyDown={(e) => {
                    checkCapsLock(e);
                    if (e.key === "Enter") void finishPassphrase();
                  }}
                  onKeyUp={checkCapsLock}
                  autoComplete="new-password"
                  {...props}
                />
              )}
            </FormField>

            {capsLock && !error && (
              <div className="arasul-onboarding-hint" role="status">
                <ArrowUpFromLine size={12} aria-hidden="true" />
                Caps Lock is on.
              </div>
            )}

            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={() => void finishPassphrase()}
              loading={busy}
              disabled={busy}
            >
              {busy ? "Creating drive lock" : "Set up drive"}
            </Button>
          </>
        )}

        {step === "claude" && (
          <>
            <h2>Connect Claude Code</h2>
            <p className="arasul-muted">
              Arasul uses Anthropic's official Claude Code CLI for AI features. It's a small
              command-line program — about 50 MB — installed by Anthropic's own installer.
            </p>
            <p className="arasul-muted">
              ✨ No data leaves your device through Arasul. Your own Claude Pro or Max
              subscription is used directly — no API keys, no proxy, no Arasul cloud.
            </p>

            {claudeStatus === null && (
              <p className="arasul-muted">Checking…</p>
            )}

            {claudeStatus?.installed && installResult !== "fail" && (
              <div className="arasul-claude-status arasul-claude-status--ok">
                <Badge tone="success">Installed</Badge>
                {claudeStatus.version && (
                  <span className="ml-2 text-fg">{claudeStatus.version}</span>
                )}
                {claudeStatus.path && (
                  <div className="arasul-muted arasul-claude-path">{claudeStatus.path}</div>
                )}
              </div>
            )}

            {claudeStatus && !claudeStatus.installed && !installing && installResult !== "ok" && (
              <div className="arasul-claude-status arasul-claude-status--missing">
                <Badge tone="warning">Not installed yet</Badge>
                <div className="arasul-muted mt-2">
                  We'll run Anthropic's official installer for you — no terminal needed.
                </div>
              </div>
            )}

            {(installing || installLog) && (
              <pre
                ref={logRef}
                className="arasul-install-log"
                aria-live="polite"
              >{installLog}</pre>
            )}

            {installResult === "ok" && (
              <div className="arasul-claude-status arasul-claude-status--ok">
                Installed. You'll log in with your Claude account the first time you open a chat.
              </div>
            )}

            {installResult === "fail" && (
              <div className="arasul-error">
                Install didn't complete. You can try again, skip for now, or install Claude Code
                manually from <a href="https://claude.ai" target="_blank" rel="noreferrer">claude.ai</a> and come back.
              </div>
            )}

            <div className="arasul-onboarding-actions">
              {claudeStatus && !claudeStatus.installed && installResult !== "ok" && (
                <Button
                  variant="primary"
                  onClick={() => void installClaude()}
                  loading={installing}
                  disabled={installing}
                >
                  {installing
                    ? "Installing"
                    : installResult === "fail"
                    ? "Try again"
                    : "Install Claude Code"}
                </Button>
              )}
              <Button
                variant="ghost"
                onClick={next}
                disabled={installing}
              >
                {claudeStatus?.installed || installResult === "ok" ? "Continue" : "Skip for now"}
              </Button>
            </div>
          </>
        )}

        {step === "auto-launch" && (
          <>
            <h2>Open Arasul automatically?</h2>
            <p className="arasul-muted">
              When you plug this drive into this computer, open the app. You can change this in Settings.
            </p>

            <label className="inline-flex items-center gap-3 my-3 cursor-pointer select-none">
              <Switch checked={autoLaunch} onCheckedChange={setAutoLaunch} />
              <span className="text-[length:var(--text-body)] text-fg">
                Yes, open automatically
              </span>
            </label>

            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={() => void finishAutoLaunch()}
              loading={busy}
              disabled={busy}
            >
              {busy ? "Installing" : "Enter Arasul"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
