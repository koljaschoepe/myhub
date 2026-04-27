import { useState, useEffect, useRef } from "react";
import { zxcvbn, zxcvbnOptions } from "@zxcvbn-ts/core";
import * as zxcvbnCommonPackage from "@zxcvbn-ts/language-common";
import * as zxcvbnEnPackage from "@zxcvbn-ts/language-en";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useSession } from "../lib/session";
import { useFocusTrap } from "../lib/useFocusTrap";
import { notify } from "../lib/toast";
import "./Onboarding.css";

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
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [strength, setStrength] = useState<{ score: number; feedback?: string } | null>(null);
  const [autoLaunch, setAutoLaunch] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Phase 4 — Claude install state.
  const [claudeStatus, setClaudeStatus] = useState<ClaudeInstallStatus | null>(null);
  const [installing, setInstalling] = useState(false);
  const [installLog, setInstallLog] = useState<string>("");
  const [installResult, setInstallResult] = useState<"ok" | "fail" | null>(null);
  const logRef = useRef<HTMLPreElement>(null);

  const cardRef = useRef<HTMLDivElement>(null);
  useFocusTrap(cardRef);

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
    const order: Step[] = ["welcome", "passphrase", "claude", "auto-launch"];
    const i = order.indexOf(step);
    setStep(order[Math.min(i + 1, order.length - 1)]);
  };

  const finishPassphrase = async () => {
    setError(null);
    if (passphrase.length < 4) { setError("At least 4 characters."); return; }
    if (passphrase !== confirm) { setError("Passphrases don't match."); return; }
    setBusy(true);
    try {
      await create(passphrase);
      try {
        await invoke("set_config", { driveRoot, patch: { general: { name } } });
      } catch { /* best-effort; missing config is fine */ }
      next();
    } catch (e) {
      setError(`Couldn't create vault: ${String(e)}`);
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
    // Cleanup listener when this step is left.
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

  return (
    <div className="arasul-onboarding">
      <div
        ref={cardRef}
        className="arasul-onboarding-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        tabIndex={-1}
      >
        {step === "welcome" && (
          <>
            <div id="onboarding-title" className="arasul-brand-hero">Arasul</div>
            <p>A portable AI workspace on a drive you carry.</p>
            <label>What should we call you?</label>
            <input
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) next(); }}
            />
            <button
              type="button"
              onClick={next}
              className="arasul-btn primary"
              disabled={!name.trim()}
            >Continue</button>
          </>
        )}

        {step === "passphrase" && (
          <>
            <h2>Set a passphrase, {name.split(" ")[0] || "friend"}.</h2>
            <p className="arasul-muted">
              This protects your AI credentials on the drive. You enter it each time you plug in.
              Write it somewhere safe — if you lose it, your login is gone but your files are not.
            </p>
            <input
              type="password"
              placeholder="Passphrase"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              autoFocus
            />
            {strength && (
              <div className="arasul-strength">
                <div className={`arasul-strength-bar score-${strength.score}`} />
                <span>{["too weak", "weak", "fair", "good", "strong"][strength.score]}</span>
                {strength.feedback && <span className="arasul-muted">· {strength.feedback}</span>}
              </div>
            )}
            <input
              type="password"
              placeholder="Confirm passphrase"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void finishPassphrase(); }}
            />
            {error && <div className="arasul-error">{error}</div>}
            <button type="button" onClick={() => void finishPassphrase()} disabled={busy} className="arasul-btn primary">
              {busy ? "Creating vault…" : "Create vault"}
            </button>
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
                <strong>Installed.</strong>
                {claudeStatus.version && <span> {claudeStatus.version}</span>}
                {claudeStatus.path && (
                  <div className="arasul-muted arasul-claude-path">{claudeStatus.path}</div>
                )}
              </div>
            )}

            {claudeStatus && !claudeStatus.installed && !installing && installResult !== "ok" && (
              <div className="arasul-claude-status arasul-claude-status--missing">
                <strong>Not installed yet.</strong>
                <div className="arasul-muted">
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
                manually from https://claude.ai and come back.
              </div>
            )}

            <div className="arasul-onboarding-actions">
              {claudeStatus && !claudeStatus.installed && installResult !== "ok" && (
                <button
                  type="button"
                  onClick={() => void installClaude()}
                  disabled={installing}
                  className="arasul-btn primary"
                >
                  {installing ? "Installing…" : (installResult === "fail" ? "Try again" : "Install Claude Code")}
                </button>
              )}
              <button
                type="button"
                onClick={next}
                disabled={installing}
                className="arasul-btn"
              >
                {claudeStatus?.installed || installResult === "ok" ? "Continue" : "Skip for now"}
              </button>
            </div>
          </>
        )}

        {step === "auto-launch" && (
          <>
            <h2>Open Arasul automatically?</h2>
            <p className="arasul-muted">
              When you plug this drive into this computer, open the app. You can change this in Settings.
            </p>
            <label className="arasul-check">
              <input
                type="checkbox"
                checked={autoLaunch}
                onChange={(e) => setAutoLaunch(e.target.checked)}
              />
              Yes, open automatically
            </label>
            <button type="button" onClick={() => void finishAutoLaunch()} disabled={busy} className="arasul-btn primary">
              {busy ? "Installing…" : "Enter Arasul"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
