/**
 * Translate Rust-side `ArasulError` (or any thrown value) into a friendly
 * { title, description } pair for toasts and modals. Keep titles short
 * and actionable; descriptions can be longer.
 *
 * The Rust enum is in `src-tauri/src/ipc/error.rs`. When new variants are
 * added there, mirror them here.
 */

type Friendly = { title: string; description?: string };

const KIND_MAP: Record<string, (msg: string) => Friendly> = {
  vault_locked: () => ({
    title: "Your drive is locked",
    description: "Unlock with your passphrase to continue.",
  }),
  vault_wrong_passphrase: () => ({
    title: "Wrong passphrase",
    description: "Check capitalization and try again.",
  }),
  fs_io: (msg) => ({
    title: "Couldn't read or write a file",
    description: msg,
  }),
  claude_launch: (msg) => ({
    title: "Couldn't start Claude",
    description: msg || "The bundled Claude binary may be missing from the drive.",
  }),
  pty_closed: () => ({
    title: "Terminal connection lost",
    description: "Click the terminal to reopen it.",
  }),
  not_supported_on_os: (msg) => ({
    title: "Not available on this OS",
    description: msg,
  }),
  internal: (msg) => ({
    title: "Something went wrong",
    description: msg,
  }),
};

/** Best-effort: pull a string out of whatever invoke() rejected with. */
export function errorMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (typeof e === "object" && e !== null) {
    const obj = e as Record<string, unknown>;
    if (typeof obj.message === "string") return obj.message;
    if (typeof obj.kind === "string") return obj.kind;
  }
  return String(e);
}

/** Map a thrown invoke() value to a user-facing pair. */
export function describeError(e: unknown): Friendly {
  if (typeof e === "object" && e !== null) {
    const obj = e as { kind?: string; message?: string };
    if (typeof obj.kind === "string" && KIND_MAP[obj.kind]) {
      return KIND_MAP[obj.kind](obj.message ?? "");
    }
  }
  const msg = errorMessage(e);
  return { title: "Something went wrong", description: msg };
}
