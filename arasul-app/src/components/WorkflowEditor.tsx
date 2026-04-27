import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import CodeMirror from "@uiw/react-codemirror";
import { yaml as yamlLang } from "@codemirror/lang-yaml";
import { EditorView } from "@codemirror/view";
import { Play, Square, CheckCircle2, XCircle, Loader2, Circle, History, Trash2, RotateCcw, MessageSquare } from "lucide-react";
import { useSession } from "../lib/session";
import { notify } from "../lib/toast";
import "./WorkflowEditor.css";

// ---------------- Backend types (mirrors workflow.rs) ----------------

type RunStatus = "pending" | "running" | "ok" | "failed" | "aborted";

type StepProgress = {
  id: string;
  status: RunStatus;
  error?: string;
};

type WorkflowRun = {
  run_id: string;
  workflow_path: string;
  workflow_name: string;
  status: RunStatus;
  started_at: number;
  current_step?: string;
  steps: StepProgress[];
  log: string[];
  outputs: Record<string, unknown>;
  error?: string;
};

type RunSummary = {
  run_id: string;
  workflow_path: string;
  workflow_name: string;
  status: RunStatus;
  started_at: number;
  finished_at?: number;
  error?: string;
};

type PromptPayload = {
  step_id: string;
  question: string;
  options: string[];
  allow_free_text: boolean;
};

type Props = { filePath: string };

const SAVE_DEBOUNCE_MS = 1000;
const STATUS_POLL_MS = 800;

export function WorkflowEditor({ filePath }: Props) {
  const { driveRoot } = useSession();
  const [source, setSource] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<WorkflowRun | null>(null);
  const [running, setRunning] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"clean" | "dirty" | "saving" | "saved" | "error">("clean");
  const [history, setHistory] = useState<RunSummary[]>([]);
  const [viewingHistorical, setViewingHistorical] = useState(false);
  const [prompt, setPrompt] = useState<PromptPayload | null>(null);
  const [promptDraft, setPromptDraft] = useState("");
  const [promptSubmitting, setPromptSubmitting] = useState(false);
  const saveTimer = useRef<number | null>(null);
  const lastSaved = useRef<string>("");

  // Fetch run history for this workflow. Re-runs whenever a run finishes
  // (running state flips false) so newly-completed runs surface immediately.
  const refreshHistory = useCallback(async () => {
    try {
      const list = await invoke<RunSummary[]>("workflow_run_history", {
        args: { drive_root: driveRoot, workflow_path: filePath, limit: 30 },
      });
      setHistory(list);
    } catch (e) {
      // History failure shouldn't block the editor; log silently.
      console.warn("workflow_run_history:", e);
    }
  }, [driveRoot, filePath]);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  useEffect(() => {
    if (!running) void refreshHistory();
  }, [running, refreshHistory]);

  // Load YAML source on mount.
  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setRun(null);
    setRunId(null);
    (async () => {
      try {
        const text = await invoke<string>("read_file", { path: filePath });
        if (cancelled) return;
        setSource(text);
        lastSaved.current = text;
        setLoaded(true);
      } catch (e) {
        if (!cancelled) notify.err("Couldn't open workflow", e);
      }
    })();
    return () => { cancelled = true; };
  }, [filePath]);

  // Autosave on edit (so a Run picks up the latest definition without
  // requiring an explicit ⌘S). Debounce 1s — workflows are short files.
  const onSourceChange = useCallback((value: string) => {
    setSource(value);
    if (value === lastSaved.current) return;
    setSaveStatus("dirty");
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    const path = filePath;
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      setSaveStatus("saving");
      void invoke("write_file", { path, content: value })
        .then(() => {
          lastSaved.current = value;
          setSaveStatus("saved");
          window.setTimeout(() => setSaveStatus((s) => (s === "saved" ? "clean" : s)), 1200);
        })
        .catch((e) => {
          setSaveStatus("error");
          notify.err("Couldn't save workflow", e);
        });
    }, SAVE_DEBOUNCE_MS);
  }, [filePath]);

  // ⌘S — flush pending save immediately.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.shiftKey) return;
      if (e.key.toLowerCase() !== "s") return;
      const target = e.target as HTMLElement | null;
      if (!target?.closest?.(".arasul-workflow-shell")) return;
      e.preventDefault();
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      if (source !== lastSaved.current) {
        const v = source;
        const path = filePath;
        setSaveStatus("saving");
        void invoke("write_file", { path, content: v })
          .then(() => {
            lastSaved.current = v;
            setSaveStatus("saved");
            window.setTimeout(() => setSaveStatus((s) => (s === "saved" ? "clean" : s)), 1200);
          })
          .catch((e) => { setSaveStatus("error"); notify.err("Couldn't save workflow", e); });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filePath, source]);

  // Final flush on unmount.
  useEffect(() => () => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
      if (source !== lastSaved.current) {
        void invoke("write_file", { path: filePath, content: source })
          .catch((e) => notify.err("Couldn't flush workflow save", e));
      }
    }
  }, [filePath, source]);

  // ---------------- Run lifecycle ----------------

  const onRun = useCallback(async () => {
    if (running) return;
    // Flush any pending save before kicking off — the runner reads the
    // YAML from disk, not from React state.
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (source !== lastSaved.current) {
      try {
        await invoke("write_file", { path: filePath, content: source });
        lastSaved.current = source;
        setSaveStatus("clean");
      } catch (e) {
        notify.err("Couldn't save before run", e);
        return;
      }
    }
    setRunning(true);
    setViewingHistorical(false);
    setRun(null);
    setRunId(null);
    try {
      const result = await invoke<{ run_id: string }>("workflow_run", {
        args: { path: filePath },
      });
      setRunId(result.run_id);
      // Optimistic initial state — replaced on first poll below.
      setRun({
        run_id: result.run_id,
        workflow_path: filePath,
        workflow_name: "",
        status: "running",
        started_at: Math.floor(Date.now() / 1000),
        steps: [],
        log: [],
        outputs: {},
      });
    } catch (e) {
      setRunning(false);
      notify.err("Couldn't start workflow", e);
    }
  }, [filePath, running, source]);

  // Load a past run from the history list — purely a read-only replay.
  const onLoadHistorical = useCallback(async (id: string) => {
    try {
      const past = await invoke<WorkflowRun>("workflow_run_load", {
        args: { drive_root: driveRoot, run_id: id },
      });
      setRun(past);
      setRunId(null);          // disable polling
      setViewingHistorical(true);
    } catch (e) {
      notify.err("Couldn't load past run", e);
    }
  }, [driveRoot]);

  const onDeleteHistorical = useCallback(async (id: string) => {
    if (!window.confirm("Delete this run from history? This can't be undone.")) return;
    try {
      await invoke("workflow_run_delete", {
        args: { drive_root: driveRoot, run_id: id },
      });
      // If the deleted run is currently displayed, clear it.
      if (run?.run_id === id) {
        setRun(null);
        setViewingHistorical(false);
      }
      void refreshHistory();
    } catch (e) {
      notify.err("Couldn't delete run", e);
    }
  }, [driveRoot, run?.run_id, refreshHistory]);

  // Listen for prompt-user requests from the runner. Each prompt opens
  // the modal; submit invokes workflow_prompt_response which unblocks
  // the runner thread waiting on its mpsc channel.
  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    let unlisten: UnlistenFn | null = null;
    (async () => {
      unlisten = await listen<PromptPayload>(
        `workflow://${runId}/prompt`,
        (e) => {
          if (cancelled) return;
          setPrompt(e.payload);
          setPromptDraft("");
        },
      );
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [runId]);

  const submitPromptAnswer = useCallback(async (answer: string) => {
    if (!runId || !prompt || promptSubmitting) return;
    setPromptSubmitting(true);
    try {
      await invoke("workflow_prompt_response", {
        args: { run_id: runId, answer },
      });
      setPrompt(null);
      setPromptDraft("");
    } catch (e) {
      notify.err("Couldn't deliver answer", e);
    } finally {
      setPromptSubmitting(false);
    }
  }, [runId, prompt, promptSubmitting]);

  // If the run ended (e.g. aborted) while a prompt was open, dismiss it.
  useEffect(() => {
    if (run && run.status !== "running") {
      setPrompt(null);
    }
  }, [run]);

  // Poll status while a run is active. Stops polling on terminal status
  // (ok / failed / aborted). Listens to `done` event as a fast-path
  // shortcut so the UI flips immediately when the runner finishes.
  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    let unlisten: UnlistenFn | null = null;
    let timer: number | null = null;

    const poll = async () => {
      if (cancelled) return;
      try {
        const r = await invoke<WorkflowRun>("workflow_status", { args: { run_id: runId } });
        if (cancelled) return;
        setRun(r);
        if (r.status === "running") {
          timer = window.setTimeout(poll, STATUS_POLL_MS);
        } else {
          setRunning(false);
        }
      } catch (e) {
        if (!cancelled) {
          notify.err("Lost track of workflow run", e);
          setRunning(false);
        }
      }
    };

    (async () => {
      unlisten = await listen<{ status: string; error?: string }>(
        `workflow://${runId}/done`,
        () => {
          // Forces an immediate poll to get the final state.
          if (timer) window.clearTimeout(timer);
          void poll();
        },
      );
      void poll();
    })();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      unlisten?.();
    };
  }, [runId]);

  // ---------------- Render ----------------

  const cmExtensions = useMemo(() => [
    yamlLang(),
    EditorView.lineWrapping,
    EditorView.theme({
      "&": {
        backgroundColor: "var(--bg-canvas)",
        color: "var(--text-primary)",
        height: "100%",
        fontSize: "13px",
      },
      ".cm-scroller": {
        fontFamily: "var(--font-mono)",
        lineHeight: "1.6",
        padding: "12px 0",
      },
      ".cm-content": {
        padding: "0 16px",
      },
      ".cm-cursor": { borderLeftColor: "var(--accent)" },
      ".cm-selectionBackground": { backgroundColor: "var(--accent-soft) !important" },
    }, { dark: true }),
  ], []);

  if (!loaded) {
    return <div className="arasul-workflow-loading">Loading workflow…</div>;
  }

  return (
    <div className="arasul-workflow-shell">
      <div className="arasul-workflow-header">
        <div className="arasul-workflow-title">
          <span className="arasul-workflow-name">
            {run?.workflow_name || workflowNameFromPath(filePath)}
          </span>
          <span className={"arasul-workflow-savestatus arasul-workflow-savestatus-" + saveStatus}>
            {saveStatus === "saving" ? "saving…" :
             saveStatus === "saved" ? "saved" :
             saveStatus === "dirty" ? "unsaved" :
             saveStatus === "error" ? "save failed" : ""}
          </span>
        </div>
        {running && runId && (
          <button
            type="button"
            className="arasul-workflow-abort"
            onClick={() => {
              void invoke("workflow_abort", { args: { run_id: runId } })
                .catch((e) => notify.err("Couldn't abort", e));
            }}
            title="Abort run"
          >
            <Square size={12} />
            <span>Abort</span>
          </button>
        )}
        <button
          type="button"
          className={"arasul-workflow-run" + (running ? " busy" : "")}
          onClick={() => void onRun()}
          disabled={running}
          title={running ? "Running…" : "Run workflow"}
        >
          {running ? <Loader2 size={14} className="arasul-workflow-spin" /> : <Play size={14} />}
          <span>{running ? "Running" : "Run"}</span>
        </button>
      </div>
      <div className="arasul-workflow-body">
        <div className="arasul-workflow-source">
          <CodeMirror
            value={source}
            height="100%"
            theme="dark"
            extensions={cmExtensions}
            basicSetup={{ lineNumbers: true, foldGutter: true, autocompletion: false }}
            onChange={onSourceChange}
          />
        </div>
        <aside className="arasul-workflow-runs">
          {!run && (
            <div className="arasul-workflow-empty">
              <p>Press <kbd>Run</kbd> to execute this workflow.</p>
              <p className="arasul-workflow-hint">
                Steps run sequentially. Each step's output is available as
                <code>{"{{stepId.field}}"}</code> in later steps.
              </p>
            </div>
          )}
          {viewingHistorical && run && (
            <div className="arasul-workflow-replay-banner">
              <History size={11} />
              <span>Replay · read-only</span>
              <button
                type="button"
                className="arasul-workflow-replay-clear"
                title="Close replay"
                onClick={() => { setRun(null); setViewingHistorical(false); }}
              >
                <RotateCcw size={11} />
              </button>
            </div>
          )}
          {run && (
            <>
              <header className="arasul-workflow-runs-head">
                <span className={"arasul-workflow-runs-status arasul-workflow-runs-status-" + run.status}>
                  {labelForStatus(run.status)}
                </span>
                <span className="arasul-workflow-runs-id" title={run.run_id}>
                  {run.run_id.slice(0, 8)}
                </span>
              </header>
              <ul className="arasul-workflow-steps" aria-label="Workflow steps">
                {run.steps.map((s) => (
                  <li
                    key={s.id}
                    className={"arasul-workflow-step arasul-workflow-step-" + s.status}
                  >
                    <span className="arasul-workflow-step-icon">{iconForStatus(s.status)}</span>
                    <span className="arasul-workflow-step-id">{s.id}</span>
                    {s.error && <span className="arasul-workflow-step-err" title={s.error}>{s.error}</span>}
                  </li>
                ))}
              </ul>
              <pre className="arasul-workflow-log" aria-label="Workflow log">
                {run.log.join("\n")}
              </pre>
            </>
          )}
          {prompt && runId && (
            <PromptDialog
              prompt={prompt}
              draft={promptDraft}
              setDraft={setPromptDraft}
              submitting={promptSubmitting}
              onSubmit={(value) => void submitPromptAnswer(value)}
            />
          )}
          {history.length > 0 && (
            <details className="arasul-workflow-history" open>
              <summary>
                <History size={12} />
                <span>History</span>
                <span className="arasul-workflow-history-count">{history.length}</span>
              </summary>
              <ul className="arasul-workflow-history-list">
                {history.map((h) => (
                  <li key={h.run_id} className={"arasul-workflow-history-row arasul-workflow-history-row-" + h.status}>
                    <button
                      type="button"
                      className="arasul-workflow-history-load"
                      onClick={() => void onLoadHistorical(h.run_id)}
                      title={h.error || `${h.status} — click to replay`}
                    >
                      <span className="arasul-workflow-history-icon">{iconForStatus(h.status)}</span>
                      <span className="arasul-workflow-history-time">{formatRelative(h.started_at)}</span>
                      {h.finished_at && (
                        <span className="arasul-workflow-history-dur">
                          {formatDuration(h.finished_at - h.started_at)}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      className="arasul-workflow-history-del"
                      onClick={() => void onDeleteHistorical(h.run_id)}
                      title="Delete this run"
                      aria-label="Delete run from history"
                    >
                      <Trash2 size={10} />
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </aside>
      </div>
    </div>
  );
}

// ---------------- PromptDialog ----------------

function PromptDialog({
  prompt, draft, setDraft, submitting, onSubmit,
}: {
  prompt: PromptPayload;
  draft: string;
  setDraft: (s: string) => void;
  submitting: boolean;
  onSubmit: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const showFreeText = prompt.options.length === 0 || prompt.allow_free_text;
  useEffect(() => {
    if (showFreeText) inputRef.current?.focus();
  }, [showFreeText]);

  return (
    <div className="arasul-workflow-prompt" role="dialog" aria-label="Workflow prompt">
      <header className="arasul-workflow-prompt-head">
        <MessageSquare size={12} />
        <span>{prompt.step_id}</span>
      </header>
      <p className="arasul-workflow-prompt-question">{prompt.question}</p>
      {prompt.options.length > 0 && (
        <div className="arasul-workflow-prompt-options">
          {prompt.options.map((opt) => (
            <button
              key={opt}
              type="button"
              className="arasul-workflow-prompt-option"
              disabled={submitting}
              onClick={() => onSubmit(opt)}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
      {showFreeText && (
        <form
          className="arasul-workflow-prompt-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.trim()) return;
            onSubmit(draft.trim());
          }}
        >
          <input
            ref={inputRef}
            type="text"
            className="arasul-workflow-prompt-input"
            placeholder={prompt.options.length > 0 ? "Or type your own answer…" : "Your answer…"}
            value={draft}
            disabled={submitting}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button
            type="submit"
            className="arasul-workflow-prompt-submit"
            disabled={submitting || !draft.trim()}
          >
            {submitting ? "…" : "Send"}
          </button>
        </form>
      )}
      <p className="arasul-workflow-prompt-hint">
        Use <kbd>Abort</kbd> in the header to cancel this prompt.
      </p>
    </div>
  );
}

function formatRelative(epochSec: number): string {
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - epochSec);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

// ---------------- Helpers ----------------

function workflowNameFromPath(p: string): string {
  const base = p.split("/").pop() ?? p;
  return base.replace(/\.(ya?ml)$/i, "");
}

function labelForStatus(s: RunStatus): string {
  switch (s) {
    case "pending":  return "pending";
    case "running":  return "running";
    case "ok":       return "✓ done";
    case "failed":   return "✗ failed";
    case "aborted":  return "aborted";
  }
}

function iconForStatus(s: RunStatus): React.ReactNode {
  switch (s) {
    case "pending":  return <Circle size={12} />;
    case "running":  return <Loader2 size={12} className="arasul-workflow-spin" />;
    case "ok":       return <CheckCircle2 size={12} />;
    case "failed":   return <XCircle size={12} />;
    case "aborted":  return <XCircle size={12} />;
  }
}
