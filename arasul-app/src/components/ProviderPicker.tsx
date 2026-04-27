import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import "./ProviderPicker.css";

/**
 * ProviderPicker — Phase 5 of the master plan.
 *
 * Lists every AI provider (Claude Code, OpenAI Codex, Google Gemini, Cursor,
 * Ollama) with installation/auth status. Lets the user trigger the vendor's
 * official installer in-place. No "Add provider" wizard yet — the five
 * known providers are baked in and that's deliberate: each new provider is
 * a Rust adapter, not a runtime config blob.
 *
 * Wire this in wherever the user picks where AI calls go (Settings page,
 * chat surface header, or both). Uncontrolled by default; pass
 * `selectedId` + `onSelect` to control selection externally.
 */

type Billing = "subscription" | "api" | "local";
type Role = "chat" | "edit" | "apply" | "autocomplete" | "embed" | "rerank";

type ProviderKind =
  | { kind: "cli-sidecar"; binary: string }
  | { kind: "http-api"; baseUrl: string };

type Capabilities = {
  streaming: boolean;
  tools: boolean;
  vision: boolean;
  embeddings: boolean;
  roles: Role[];
};

type InstallCommand = {
  posix: string | null;
  windowsPs: string | null;
  prerequisiteNote: string | null;
  docsUrl: string | null;
};

type ProviderSummary = {
  id: string;
  displayName: string;
  billing: Billing;
  kind: ProviderKind;
  capabilities: Capabilities;
  installCommand: InstallCommand | null;
};

type AuthStatus =
  | { state: "logged-in"; detail: string | null }
  | { state: "needs-login" }
  | { state: "needs-key" }
  | { state: "not-installed" }
  | { state: "unknown"; detail: string };

type AuthStatusResponse = { id: string; status: AuthStatus };

type InstallChunk = {
  delta?: string;
  stream?: "stderr";
  done?: boolean;
  ok?: boolean;
  exit_code?: number | null;
  resolved_path?: string | null;
  provider_id?: string;
};

type InstallSession = {
  log: string;
  result: "ok" | "fail" | null;
  unlisten: UnlistenFn | null;
};

interface Props {
  selectedId?: string;
  onSelect?: (id: string) => void;
}

export function ProviderPicker({ selectedId, onSelect }: Props) {
  const [providers, setProviders] = useState<ProviderSummary[] | null>(null);
  const [statuses, setStatuses] = useState<Record<string, AuthStatus>>({});
  const [install, setInstall] = useState<Record<string, InstallSession>>({});
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = useCallback(async (id: string) => {
    try {
      const r = await invoke<AuthStatusResponse>("provider_auth_status", { id });
      setStatuses((prev) => ({ ...prev, [id]: r.status }));
    } catch (e) {
      setStatuses((prev) => ({
        ...prev,
        [id]: { state: "unknown", detail: String(e) },
      }));
    }
  }, []);

  const refreshAll = useCallback(async (list: ProviderSummary[]) => {
    await Promise.all(list.map((p) => refreshStatus(p.id)));
  }, [refreshStatus]);

  // Initial load.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await invoke<ProviderSummary[]>("provider_list");
        if (cancelled) return;
        setProviders(list);
        void refreshAll(list);
      } catch (e) {
        setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshAll]);

  // Cleanup install listeners on unmount.
  useEffect(() => {
    return () => {
      Object.values(install).forEach((s) => s.unlisten?.());
    };
  }, [install]);

  const startInstall = async (id: string) => {
    setInstall((prev) => ({
      ...prev,
      [id]: { log: "", result: null, unlisten: null },
    }));
    let unlisten: UnlistenFn | null = null;
    try {
      const channel = await invoke<string>("provider_install", { id });
      unlisten = await listen<InstallChunk>(channel, (event) => {
        const chunk = event.payload;
        if (chunk.delta) {
          setInstall((prev) => ({
            ...prev,
            [id]: {
              ...(prev[id] ?? { log: "", result: null, unlisten }),
              log: (prev[id]?.log ?? "") + chunk.delta,
            },
          }));
        }
        if (chunk.done) {
          setInstall((prev) => ({
            ...prev,
            [id]: {
              ...(prev[id] ?? { log: "", result: null, unlisten: null }),
              result: chunk.ok ? "ok" : "fail",
            },
          }));
          if (chunk.ok) void refreshStatus(id);
        }
      });
      setInstall((prev) => ({
        ...prev,
        [id]: { ...(prev[id] ?? { log: "", result: null }), unlisten },
      }));
    } catch (e) {
      setInstall((prev) => ({
        ...prev,
        [id]: {
          log: `Failed to start installer: ${String(e)}\n`,
          result: "fail",
          unlisten,
        },
      }));
    }
  };

  if (error) {
    return <div className="arasul-pp-error">Couldn't load providers: {error}</div>;
  }
  if (!providers) {
    return <div className="arasul-pp-loading">Loading providers…</div>;
  }

  return (
    <ul className="arasul-pp-list" role="list">
      {providers.map((p) => {
        const status = statuses[p.id];
        const sess = install[p.id];
        const isSelected = selectedId === p.id;
        const installed =
          status?.state === "logged-in" || sess?.result === "ok";
        return (
          <li
            key={p.id}
            className={`arasul-pp-item ${isSelected ? "arasul-pp-item--selected" : ""}`}
          >
            <button
              type="button"
              className="arasul-pp-item-main"
              onClick={() => onSelect?.(p.id)}
              disabled={!installed}
              aria-pressed={isSelected}
              aria-disabled={!installed}
            >
              <div className="arasul-pp-item-row">
                <span className="arasul-pp-name">{p.displayName}</span>
                <BillingBadge billing={p.billing} />
                <StatusBadge status={status} />
              </div>
              {status?.state === "logged-in" && status.detail && (
                <div className="arasul-pp-detail">{status.detail}</div>
              )}
            </button>

            {!installed && p.installCommand && (
              <InstallControls
                providerId={p.id}
                command={p.installCommand}
                session={sess}
                onInstall={() => void startInstall(p.id)}
              />
            )}

            {sess?.log && (
              <pre className="arasul-pp-log" aria-live="polite">
                {sess.log}
              </pre>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function BillingBadge({ billing }: { billing: Billing }) {
  const label =
    billing === "subscription" ? "subscription" :
    billing === "api"          ? "api key"     :
                                 "local";
  return <span className={`arasul-pp-badge arasul-pp-badge--${billing}`}>{label}</span>;
}

function StatusBadge({ status }: { status: AuthStatus | undefined }) {
  if (!status) return <span className="arasul-pp-badge">checking…</span>;
  switch (status.state) {
    case "logged-in":     return <span className="arasul-pp-badge arasul-pp-badge--ok">ready</span>;
    case "needs-login":   return <span className="arasul-pp-badge arasul-pp-badge--warn">needs login</span>;
    case "needs-key":     return <span className="arasul-pp-badge arasul-pp-badge--warn">needs API key</span>;
    case "not-installed": return <span className="arasul-pp-badge arasul-pp-badge--missing">not installed</span>;
    case "unknown":       return <span className="arasul-pp-badge arasul-pp-badge--warn">unknown</span>;
  }
}

function InstallControls({
  providerId,
  command,
  session,
  onInstall,
}: {
  providerId: string;
  command: InstallCommand;
  session: InstallSession | undefined;
  onInstall: () => void;
}) {
  const installing = !!session && session.result === null && !!session.log;
  const failed = session?.result === "fail";
  return (
    <div className="arasul-pp-install">
      {command.prerequisiteNote && (
        <div className="arasul-pp-prereq">{command.prerequisiteNote}</div>
      )}
      <div className="arasul-pp-install-actions">
        <button
          type="button"
          className="arasul-btn primary"
          onClick={onInstall}
          disabled={installing}
        >
          {installing ? "Installing…" : failed ? "Try again" : "Install"}
        </button>
        {command.docsUrl && (
          <a
            className="arasul-pp-docs"
            href={command.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Docs ↗
          </a>
        )}
      </div>
      {failed && (
        <div className="arasul-pp-error-inline">
          Install didn't complete for {providerId}. Check the log; you can try
          again or follow the docs link to install manually.
        </div>
      )}
    </div>
  );
}
