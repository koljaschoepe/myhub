import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";

export type SessionState =
  | { status: "checking" }
  | { status: "absent" }      // no vault.enc — onboarding flow
  | { status: "locked" }      // vault exists, not unlocked
  | { status: "unlocked"; handle: string };

type SessionContextValue = {
  state: SessionState;
  driveRoot: string;
  unlock: (passphrase: string) => Promise<void>;
  lock: () => Promise<void>;
  create: (passphrase: string) => Promise<void>;
  refresh: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children, driveRoot }: { children: ReactNode; driveRoot: string }) {
  const [state, setState] = useState<SessionState>({ status: "checking" });

  const refresh = async () => {
    try {
      const exists = await invoke<boolean>("vault_exists", { driveRoot });
      setState(exists ? { status: "locked" } : { status: "absent" });
    } catch (e) {
      console.error("vault_exists failed:", e);
      setState({ status: "absent" });
    }
  };

  useEffect(() => { void refresh(); }, [driveRoot]);

  const unlock = async (passphrase: string) => {
    const handle = await invoke<string>("vault_unlock", { driveRoot, passphrase });
    setState({ status: "unlocked", handle });
  };

  const lock = async () => {
    await invoke("vault_lock");
    setState({ status: "locked" });
  };

  const create = async (passphrase: string) => {
    await invoke("vault_create", { driveRoot, passphrase });
    await unlock(passphrase);
  };

  return (
    <SessionContext.Provider value={{ state, driveRoot, unlock, lock, create, refresh }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
