import { useState, useRef, useEffect } from "react";
import { useSession } from "../lib/session";
import { useFocusTrap } from "../lib/useFocusTrap";
import "./Unlock.css";

/**
 * Phase 1.3 — passphrase-gated unlock screen.
 *
 * Shown when vault.enc exists and no session is active. First-run lands
 * in Onboarding (separate screen), not here.
 */
export function Unlock() {
  const { unlock } = useSession();
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorNonce, setErrorNonce] = useState(0);
  const [shaking, setShaking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  useFocusTrap(formRef);

  useEffect(() => { inputRef.current?.focus(); }, []);

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
      setError(msg === "vault_wrong_passphrase" ? "Wrong passphrase." : `Unlock failed: ${msg}`);
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
        ref={formRef}
        className={"arasul-unlock-form" + (shaking ? " shake" : "")}
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="unlock-brand"
      >
        <div id="unlock-brand" className="arasul-unlock-brand">Arasul</div>
        <div className="arasul-unlock-sub">Welcome back. Unlock your drive.</div>
        <input
          ref={inputRef}
          type="password"
          className="arasul-unlock-input"
          placeholder="Passphrase"
          autoComplete="current-password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          disabled={busy}
        />
        {error && <div className="arasul-unlock-error">{error}</div>}
        <button type="submit" className="arasul-unlock-btn" disabled={busy || !passphrase}>
          {busy ? "Unlocking…" : "Unlock"}
        </button>
        <div className="arasul-unlock-footer">
          Forgot passphrase? The vault must be recreated — your files are not lost.
        </div>
      </form>
    </div>
  );
}
