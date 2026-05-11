import { useState, useRef, useEffect, useCallback } from "react";
import { Eye, EyeOff, ArrowUpFromLine } from "lucide-react";
import { useSession } from "../lib/session";
import { Button, Input, IconButton } from "../components/ui";
import "./Unlock.css";

/**
 * Phase 1.3 — passphrase-gated unlock screen.
 * Phase 1.7 (2026-05-11) — migrated to ui/ primitives + added show/hide
 * password toggle (a Phase 4.2 quick win, easy now that Input has a
 * `trailing` slot).
 *
 * Shown when vault.enc exists and no session is active. First-run lands
 * in Onboarding (separate screen), not here.
 *
 * Note: this is a *full-screen* unlock surface, not a modal — there's no
 * "outside" to click. The form keeps `role="dialog" aria-modal` so screen
 * readers treat the passphrase task as the focused interaction.
 */
export function Unlock() {
  const { unlock } = useSession();
  const [passphrase, setPassphrase] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorNonce, setErrorNonce] = useState(0);
  const [shaking, setShaking] = useState(false);
  // Phase 4.3: Caps-Lock detector. Surfaces an inline warning so users
  // on unfamiliar keyboards spot the most common typo before submitting.
  const [capsLock, setCapsLock] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const checkCapsLock = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    setCapsLock(e.getModifierState?.("CapsLock") ?? false);
  }, []);

  // Retrigger the shake animation each time errorNonce increments — even
  // when the same error message ("Wrong passphrase.") fires twice in a row.
  useEffect(() => {
    if (errorNonce === 0) return;
    setShaking(true);
    const t = setTimeout(() => setShaking(false), 240);
    return () => clearTimeout(t);
  }, [errorNonce]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passphrase || busy) return;
    setBusy(true);
    setError(null);
    try {
      await unlock(passphrase);
    } catch (err) {
      const msg = typeof err === "object" && err !== null && "kind" in err
        ? (err as { kind: string }).kind
        : String(err);
      // Phase 0.5: map low-level errors to user-friendly text. Anything
      // we don't recognise gets a clear "try again" framing rather than
      // exposing a raw Rust error kind to non-coders.
      let friendly: string;
      if (msg === "vault_wrong_passphrase") friendly = "Wrong passphrase.";
      else if (msg === "vault_corrupt") friendly = "Drive unlock file is damaged. Try ejecting and reconnecting the drive.";
      else if (msg.startsWith("fs_")) friendly = "Couldn't read the drive. Check it's connected and try again.";
      else friendly = `Unlock failed: ${msg}`;
      setError(friendly);
      setErrorNonce((n) => n + 1);
      setPassphrase("");
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="arasul-unlock">
      <form
        className={"arasul-unlock-form" + (shaking ? " shake" : "")}
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="unlock-brand"
      >
        <div id="unlock-brand" className="arasul-unlock-brand">Arasul</div>
        <div className="arasul-unlock-sub">Welcome back. Unlock your drive.</div>

        <Input
          ref={inputRef}
          type={showPassword ? "text" : "password"}
          size="lg"
          placeholder="Passphrase"
          autoComplete="current-password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          onKeyDown={checkCapsLock}
          onKeyUp={checkCapsLock}
          disabled={busy}
          aria-invalid={!!error}
          aria-describedby={error ? "unlock-error" : capsLock ? "unlock-caps" : undefined}
          trailing={
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
          }
        />

        {capsLock && !error && (
          <div id="unlock-caps" className="arasul-unlock-hint" role="status">
            <ArrowUpFromLine size={12} aria-hidden="true" />
            Caps Lock is on.
          </div>
        )}

        {error && (
          <div id="unlock-error" className="arasul-unlock-error" role="alert">
            {error}
          </div>
        )}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full"
          loading={busy}
          disabled={busy || !passphrase}
        >
          {busy ? "Unlocking" : "Unlock"}
        </Button>

        <div className="arasul-unlock-footer">
          Forgot your passphrase? You can reset the drive unlock in Settings. Your files stay safe.
        </div>
      </form>
    </div>
  );
}
