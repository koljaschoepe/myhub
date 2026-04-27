import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { json } from "@codemirror/lang-json";
import { yaml } from "@codemirror/lang-yaml";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { sql } from "@codemirror/lang-sql";
import { xml } from "@codemirror/lang-xml";
import { EditorView, keymap } from "@codemirror/view";
import { type Extension, EditorState } from "@codemirror/state";
import { indentUnit } from "@codemirror/language";
import { search, searchKeymap } from "@codemirror/search";
import { oneDark } from "@codemirror/theme-one-dark";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Upload, X } from "lucide-react";
import { useWorkspace } from "../lib/workspace";
import { useSession } from "../lib/session";
import { useAppConfig } from "../hooks/useAppConfig";
import { MarkdownEditor } from "./MarkdownEditor";
import { SpreadsheetEditor } from "./SpreadsheetEditor";
import { WorkflowEditor } from "./WorkflowEditor";
import { notify } from "../lib/toast";
import "./EditorPane.css";

type FileKind =
  | "markdown"
  | "code"
  | "pdf"
  | "image"
  | "svg"
  | "audio"
  | "video"
  | "csv"
  | "xlsx"
  | "docx"
  | "workflow"
  | "unsupported";

type ResolvedFile = {
  kind: FileKind;
  cmLanguage: Extension | null;
  mime: string | null;
  separator?: string;
};

function resolveFile(filePath: string): ResolvedFile {
  const lower = filePath.toLowerCase();
  const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".") + 1) : "";

  if (["md", "mdx", "markdown"].includes(ext)) {
    return { kind: "markdown", cmLanguage: null, mime: "text/markdown" };
  }

  if (ext === "csv") return { kind: "csv", cmLanguage: null, mime: "text/csv", separator: "," };
  if (ext === "tsv") return { kind: "csv", cmLanguage: null, mime: "text/tab-separated-values", separator: "\t" };
  if (["xlsx", "xls", "ods"].includes(ext)) {
    return { kind: "xlsx", cmLanguage: null, mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
  }
  if (ext === "docx") return { kind: "docx", cmLanguage: null, mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };

  if (["js", "jsx", "mjs", "cjs", "ts", "tsx"].includes(ext)) {
    const isTs = ext === "ts" || ext === "tsx";
    const isJsx = ext === "jsx" || ext === "tsx";
    return { kind: "code", cmLanguage: javascript({ jsx: isJsx, typescript: isTs }), mime: "text/javascript" };
  }
  if (ext === "py") return { kind: "code", cmLanguage: python(), mime: "text/x-python" };
  if (ext === "rs") return { kind: "code", cmLanguage: rust(), mime: "text/x-rust" };
  if (ext === "json") return { kind: "code", cmLanguage: json(), mime: "application/json" };
  if (["yaml", "yml"].includes(ext)) {
    // Workflow YAMLs in projects/<x>/workflows/ get the dedicated runner UI;
    // every other YAML stays as plain code.
    if (lower.includes("/workflows/")) {
      return { kind: "workflow", cmLanguage: null, mime: "text/yaml" };
    }
    return { kind: "code", cmLanguage: yaml(), mime: "text/yaml" };
  }
  if (["html", "htm"].includes(ext)) return { kind: "code", cmLanguage: html(), mime: "text/html" };
  if (["css", "scss", "sass"].includes(ext)) return { kind: "code", cmLanguage: css(), mime: "text/css" };
  if (ext === "sql") return { kind: "code", cmLanguage: sql(), mime: "text/x-sql" };
  if (["xml", "plist"].includes(ext)) return { kind: "code", cmLanguage: xml(), mime: "text/xml" };

  if (
    ["txt", "text", "log", "toml", "ini", "conf", "cfg", "env", "go", "rb", "java",
     "c", "cpp", "h", "hpp", "swift", "kt", "scala", "lua", "php", "vue", "svelte", "dockerfile",
     "gitignore", "editorconfig"].includes(ext) ||
    !ext
  ) {
    return { kind: "code", cmLanguage: null, mime: "text/plain" };
  }

  if (ext === "pdf") return { kind: "pdf", cmLanguage: null, mime: "application/pdf" };
  if (["png", "jpg", "jpeg", "webp", "gif", "avif", "ico", "bmp"].includes(ext)) {
    return { kind: "image", cmLanguage: null, mime: `image/${ext === "jpg" ? "jpeg" : ext}` };
  }
  if (ext === "svg") return { kind: "svg", cmLanguage: html(), mime: "image/svg+xml" };

  if (["mp3", "wav", "m4a", "ogg", "flac", "aac", "opus"].includes(ext)) {
    return { kind: "audio", cmLanguage: null, mime: `audio/${ext}` };
  }
  if (["mp4", "webm", "mov", "mkv", "avi"].includes(ext)) {
    return { kind: "video", cmLanguage: null, mime: `video/${ext === "mov" ? "quicktime" : ext}` };
  }

  return { kind: "unsupported", cmLanguage: null, mime: null };
}

type ConflictState = { srcPath: string; existing: string };

export function EditorPane() {
  const { state: ws, openFile, closeFile } = useWorkspace();
  const { driveRoot } = useSession();
  const rootRef = useRef<HTMLDivElement>(null);

  // ⌘W close active tab.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "w" && ws.openFilePath) {
        e.preventDefault();
        closeFile(ws.openFilePath);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ws.openFilePath, closeFile]);
  const [dragInside, setDragInside] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [conflict, setConflict] = useState<ConflictState | null>(null);

  const slug = ws.projectSlug;

  const importPath = useCallback(async (srcPath: string, onConflict?: "replace" | "keep-both") => {
    if (!slug) {
      setImportMsg({ kind: "err", text: "Pick a project first." });
      return;
    }
    setImporting(true);
    setImportMsg(null);
    try {
      const res = await invoke<{ dest_path: string; renamed: boolean }>("import_file", {
        args: {
          src_path: srcPath,
          drive_root: driveRoot,
          project_slug: slug,
          on_conflict: onConflict ?? null,
        },
      });
      const name = res.dest_path.split("/").pop() ?? res.dest_path;
      setImportMsg({ kind: "ok", text: res.renamed ? `Imported as ${name}` : `Imported ${name}` });
      window.setTimeout(() => setImportMsg(null), 2500);
      setConflict(null);
    } catch (e) {
      const msg = errorMessage(e);
      if (msg.includes("already exists")) {
        setConflict({ srcPath, existing: msg });
      } else {
        setImportMsg({ kind: "err", text: msg });
      }
    } finally {
      setImporting(false);
    }
  }, [slug, driveRoot]);

  // Tauri 2 drag-drop. Position is window-relative physical pixels.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let mounted = true;
    (async () => {
      const w = getCurrentWebviewWindow();
      const off = await w.onDragDropEvent((event) => {
        const rect = rootRef.current?.getBoundingClientRect();
        if (!rect) return;
        const dpr = window.devicePixelRatio || 1;
        const inside = (pos: { x: number; y: number }) => {
          const x = pos.x / dpr;
          const y = pos.y / dpr;
          return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
        };
        switch (event.payload.type) {
          case "enter":
          case "over": {
            const ok = inside(event.payload.position);
            setDragInside(ok);
            break;
          }
          case "drop": {
            setDragInside(false);
            if (!inside(event.payload.position)) return;
            const paths = event.payload.paths ?? [];
            // Import each file sequentially; conflicts will pause via state.
            (async () => {
              for (const p of paths) {
                await importPath(p);
              }
            })();
            break;
          }
          case "leave":
          default:
            setDragInside(false);
        }
      });
      if (!mounted) { off(); return; }
      unlisten = off;
    })();
    return () => {
      mounted = false;
      unlisten?.();
    };
  }, [importPath]);

  const onPickImport = async () => {
    const sel = await openDialog({ multiple: false });
    if (typeof sel === "string" && sel) await importPath(sel);
  };

  if (!ws.openFilePath) {
    return (
      <div className="arasul-editor-empty arasul-editor-droproot" ref={rootRef}>
        <div className="arasul-editor-empty-title">Nothing open</div>
        <div className="arasul-editor-empty-hint">
          Pick a file in the tree, or press <kbd>⌘P</kbd> to switch projects.
        </div>
        {slug && (
          <button
            className="arasul-editor-import-btn"
            onClick={onPickImport}
            disabled={importing}
          >
            <Upload size={14} /> {importing ? "Importing…" : "Import file…"}
          </button>
        )}
        {dragInside && <DropOverlay />}
        {conflict && (
          <ConflictModal
            existing={conflict.existing}
            onReplace={() => importPath(conflict.srcPath, "replace")}
            onKeepBoth={() => importPath(conflict.srcPath, "keep-both")}
            onCancel={() => setConflict(null)}
          />
        )}
        {importMsg && (
          <div className={"arasul-import-toast arasul-import-toast-" + importMsg.kind}>{importMsg.text}</div>
        )}
      </div>
    );
  }

  const filePath = ws.openFilePath;
  const fileName = filePath.split("/").pop() ?? filePath;
  const resolved = resolveFile(filePath);

  let body: React.ReactNode;
  if (resolved.kind === "markdown") {
    body = <MarkdownEditor key={filePath} filePath={filePath} />;
  } else if (resolved.kind === "pdf") {
    body = <PdfViewer key={filePath} filePath={filePath} />;
  } else if (resolved.kind === "image") {
    body = <ImageViewer key={filePath} filePath={filePath} mime={resolved.mime ?? "image/png"} />;
  } else if (resolved.kind === "audio") {
    body = <MediaViewer key={filePath} filePath={filePath} mime={resolved.mime ?? "audio/mpeg"} kind="audio" />;
  } else if (resolved.kind === "video") {
    body = <MediaViewer key={filePath} filePath={filePath} mime={resolved.mime ?? "video/mp4"} kind="video" />;
  } else if (resolved.kind === "csv") {
    body = <CsvViewer key={filePath} filePath={filePath} separator={resolved.separator ?? ","} />;
  } else if (resolved.kind === "xlsx") {
    body = <SpreadsheetEditor key={filePath} filePath={filePath} />;
  } else if (resolved.kind === "workflow") {
    body = <WorkflowEditor key={filePath} filePath={filePath} />;
  } else if (resolved.kind === "docx") {
    body = <DocxViewer key={filePath} filePath={filePath} />;
  } else if (resolved.kind === "unsupported") {
    body = <UnsupportedViewer key={filePath} filePath={filePath} fileName={fileName} />;
  } else {
    body = (
      <TextEditor
        key={filePath}
        filePath={filePath}
        cmLanguage={resolved.cmLanguage}
      />
    );
  }

  return (
    <div className="arasul-editor arasul-editor-droproot" ref={rootRef}>
      <EditorTabs
        openFiles={ws.openFiles}
        active={filePath}
        onSelect={openFile}
        onClose={closeFile}
        importing={importing}
        canImport={!!slug}
        onImport={onPickImport}
      />
      <div className="arasul-editor-body">{body}</div>
      {dragInside && <DropOverlay />}
      {conflict && (
        <ConflictModal
          existing={conflict.existing}
          onReplace={() => importPath(conflict.srcPath, "replace")}
          onKeepBoth={() => importPath(conflict.srcPath, "keep-both")}
          onCancel={() => setConflict(null)}
        />
      )}
      {importMsg && (
        <div className={"arasul-import-toast arasul-import-toast-" + importMsg.kind}>{importMsg.text}</div>
      )}
    </div>
  );
}

// ---------------- EditorTabs (VS Code-style multi-file) ----------------

function EditorTabs({ openFiles, active, onSelect, onClose, importing, canImport, onImport }: {
  openFiles: string[];
  active: string;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
  importing: boolean;
  canImport: boolean;
  onImport: () => void;
}) {
  return (
    <div className="arasul-editor-tabs" role="tablist">
      {openFiles.map((path) => {
        const name = path.split("/").pop() ?? path;
        const isActive = path === active;
        return (
          <button
            key={path}
            role="tab"
            aria-selected={isActive}
            className={"arasul-editor-tab" + (isActive ? " active" : "")}
            onClick={() => onSelect(path)}
            title={path}
          >
            <span className="arasul-editor-tab-name">{name}</span>
            <span
              role="button"
              aria-label="close tab"
              className="arasul-editor-tab-close"
              onClick={(e) => { e.stopPropagation(); onClose(path); }}
            >
              <X size={11} strokeWidth={2.5} />
            </span>
          </button>
        );
      })}
      <span className="arasul-editor-tabs-spacer" />
      {canImport && (
        <button
          className="arasul-editor-import-icon"
          onClick={onImport}
          disabled={importing}
          title="Import file…"
          aria-label="Import file"
        >
          <Upload size={13} />
        </button>
      )}
    </div>
  );
}

// ---------------- TextEditor (CodeMirror, code/text only) ----------------

type TextEditorProps = {
  filePath: string;
  cmLanguage: Extension | null;
};

function TextEditor({ filePath, cmLanguage }: TextEditorProps) {
  const [content, setContent] = useState<string>("");
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<"clean" | "saving" | "saved" | "error">("clean");
  const cmRef = useRef<ReactCodeMirrorRef>(null);
  const saveTimer = useRef<{ id: number; path: string } | null>(null);
  const editorPrefs = useAppConfig().editor;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const text = await invoke<string>("read_file", { path: filePath });
        if (cancelled) return;
        setContent(text);
        setDirty(false);
        setStatus("clean");
      } catch (e) {
        if (cancelled) return;
        setContent(`// failed to read ${filePath}\n// ${e}`);
      }
    })();
    return () => { cancelled = true; };
  }, [filePath]);

  const save = useCallback(async (path: string, text: string) => {
    setStatus("saving");
    try {
      await invoke("write_file", { path, content: text });
      setDirty(false);
      setStatus("saved");
      window.setTimeout(() => setStatus((s) => (s === "saved" ? "clean" : s)), 1200);
    } catch (e) {
      console.error("write_file failed:", e);
      setStatus("error");
      notify.err("Couldn't save your changes", e);
    }
  }, []);

  const onChange = useCallback((v: string) => {
    setContent(v);
    setDirty(true);
    if (saveTimer.current) window.clearTimeout(saveTimer.current.id);
    const id = window.setTimeout(() => {
      void save(filePath, v);
      if (saveTimer.current?.id === id) saveTimer.current = null;
    }, 1000);
    saveTimer.current = { id, path: filePath };
  }, [save, filePath]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (saveTimer.current) {
          window.clearTimeout(saveTimer.current.id);
          saveTimer.current = null;
        }
        void save(filePath, content);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [content, save, filePath]);

  // P0 audit fix — flush pending timer for the OLD path on unmount/file
  // switch, so a debounced save can never write the wrong file. We capture
  // the bound path from the timer ref, never read filePath at fire time.
  // Surface errors here: this is the last save chance for the closing tab.
  useEffect(() => () => {
    const t = saveTimer.current;
    if (!t) return;
    window.clearTimeout(t.id);
    saveTimer.current = null;
    void invoke("write_file", { path: t.path, content }).catch((e) => {
      notify.err(`Couldn't save ${t.path.split("/").pop() ?? "file"}`, e);
    });
  }, [content]);

  const extensions = useMemo<Extension[]>(() => {
    const fontSizePx = `${editorPrefs.font_size}px`;
    const exts: Extension[] = [
      EditorState.tabSize.of(2),
      indentUnit.of("  "),
      search({ top: true }),
      keymap.of(searchKeymap),
      // Override the one-dark surface bits to match our app palette while
      // keeping its proven syntax-token colors.
      EditorView.theme({
        "&": {
          backgroundColor: "var(--bg-canvas)",
          color: "var(--text-primary)",
          height: "100%",
          fontSize: fontSizePx,
        },
        ".cm-scroller": {
          fontFamily: "var(--font-mono)",
          fontSize: fontSizePx,
          lineHeight: "1.7",
          padding: "20px 0",
        },
        ".cm-content": {
          maxWidth: "780px",
          margin: "0 auto",
          padding: "0 28px",
        },
        ".cm-gutters": {
          backgroundColor: "var(--bg-canvas)",
          color: "var(--text-tertiary)",
          border: "none",
        },
        ".cm-activeLineGutter": {
          backgroundColor: "transparent",
          color: "var(--text-secondary)",
        },
        ".cm-activeLine": { backgroundColor: "var(--hover)" },
        ".cm-cursor": { borderLeftColor: "var(--accent)" },
        ".cm-selectionBackground": { backgroundColor: "var(--accent-soft) !important" },
        ".cm-matchingBracket": {
          backgroundColor: "var(--accent-soft)",
          color: "var(--accent)",
        },
      }, { dark: true }),
      oneDark,
    ];
    if (editorPrefs.word_wrap) exts.unshift(EditorView.lineWrapping);
    if (cmLanguage) exts.unshift(cmLanguage);
    return exts;
  }, [cmLanguage, editorPrefs.font_size, editorPrefs.word_wrap]);

  return (
    <div className="arasul-editor-textbody">
      <div className="arasul-editor-cm">
        <CodeMirror
          ref={cmRef}
          value={content}
          height="100%"
          theme="none"
          basicSetup={{
            lineNumbers: editorPrefs.line_numbers,
            foldGutter: editorPrefs.line_numbers,
            bracketMatching: true,
            autocompletion: false,
            highlightActiveLine: true,
            highlightActiveLineGutter: false,
            indentOnInput: true,
          }}
          extensions={extensions}
          onChange={onChange}
        />
      </div>
      <span
        className={"arasul-editor-statusdot arasul-editor-statusdot-" + (dirty ? "dirty" : status)}
        title={dirty ? "unsaved" : status}
      />
    </div>
  );
}

// ---------------- PdfViewer ----------------

const PDF_DEFAULT_WIDTH = 760;
const PDF_WIDTH_STEP = 80;
const PDF_MIN_WIDTH = 320;
const PDF_MAX_WIDTH = 1600;

function pdfWidthKey(filePath: string): string {
  return `arasul.pdf.width.${filePath}`;
}

function PdfViewer({ filePath }: { filePath: string }) {
  const [error, setError] = useState<string | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [Document, setDocument] = useState<any>(null);
  const [Page, setPage] = useState<any>(null);
  const [width, setWidth] = useState<number>(() => {
    try {
      const stored = window.localStorage.getItem(pdfWidthKey(filePath));
      const parsed = stored ? parseInt(stored, 10) : NaN;
      if (Number.isFinite(parsed) && parsed >= PDF_MIN_WIDTH && parsed <= PDF_MAX_WIDTH) return parsed;
    } catch { /* ignore */ }
    return PDF_DEFAULT_WIDTH;
  });
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Persist zoom per-document so reopening the same PDF restores it.
  useEffect(() => {
    try { window.localStorage.setItem(pdfWidthKey(filePath), String(width)); } catch { /* ignore */ }
  }, [filePath, width]);

  const setZoom = (next: number) => {
    setWidth(Math.max(PDF_MIN_WIDTH, Math.min(PDF_MAX_WIDTH, Math.round(next))));
  };
  const zoomIn = () => setZoom(width + PDF_WIDTH_STEP);
  const zoomOut = () => setZoom(width - PDF_WIDTH_STEP);
  const resetZoom = () => setZoom(PDF_DEFAULT_WIDTH);
  const fitWidth = () => {
    const cw = scrollerRef.current?.clientWidth;
    if (!cw) return;
    setZoom(Math.max(PDF_MIN_WIDTH, cw - 48));
  };

  // ⌘+, ⌘-, ⌘0 while the PDF surface is focused.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const target = e.target as HTMLElement | null;
      if (!scrollerRef.current?.contains(target)) return;
      if (e.key === "=" || e.key === "+") { e.preventDefault(); zoomIn(); }
      else if (e.key === "-") { e.preventDefault(); zoomOut(); }
      else if (e.key === "0") { e.preventDefault(); resetZoom(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [width]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mod = await import("react-pdf");
        if (cancelled) return;
        const workerUrl = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        mod.pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        await import("react-pdf/dist/Page/AnnotationLayer.css");
        await import("react-pdf/dist/Page/TextLayer.css");
        setDocument(() => mod.Document);
        setPage(() => mod.Page);

        const b64 = await invoke<string>("read_file_bytes", { path: filePath });
        if (cancelled) return;
        setSrc(`data:application/pdf;base64,${b64}`);
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [filePath]);

  if (error) return <div className="arasul-viewer-error">Couldn't load PDF: {error}</div>;
  if (!Document || !Page || !src) return <div className="arasul-viewer-loading">Loading PDF…</div>;
  const zoomPct = Math.round((width / PDF_DEFAULT_WIDTH) * 100);
  return (
    <div className="arasul-pdf-shell" tabIndex={0}>
      <div className="arasul-pdf-toolbar" role="toolbar" aria-label="PDF zoom">
        <button type="button" className="arasul-pdf-tbtn" onClick={zoomOut} title="Zoom out (⌘−)" aria-label="Zoom out">−</button>
        <button type="button" className="arasul-pdf-tbtn arasul-pdf-zoomlabel" onClick={resetZoom} title="Reset zoom (⌘0)" aria-label={`Zoom: ${zoomPct}%, click to reset`}>
          {zoomPct}%
        </button>
        <button type="button" className="arasul-pdf-tbtn" onClick={zoomIn} title="Zoom in (⌘+)" aria-label="Zoom in">+</button>
        <button type="button" className="arasul-pdf-tbtn" onClick={fitWidth} title="Fit width" aria-label="Fit to width">Fit</button>
      </div>
      <div ref={scrollerRef} className="arasul-pdf-scroller">
        <Document
          file={src}
          onLoadSuccess={(info: { numPages: number }) => setNumPages(info.numPages)}
          onLoadError={(err: Error) => setError(err.message)}
          loading={<div className="arasul-viewer-loading">Loading PDF…</div>}
        >
          {Array.from({ length: numPages }, (_, i) => (
            <Page key={`p-${i + 1}`} pageNumber={i + 1} width={width} renderAnnotationLayer renderTextLayer />
          ))}
        </Document>
      </div>
    </div>
  );
}

// ---------------- ImageViewer ----------------

function ImageViewer({ filePath, mime }: { filePath: string; mime: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const b64 = await invoke<string>("read_file_bytes", { path: filePath });
        if (cancelled) return;
        setSrc(`data:${mime};base64,${b64}`);
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [filePath, mime]);

  if (error) return <div className="arasul-viewer-error">Couldn't load image: {error}</div>;
  if (!src) return <div className="arasul-viewer-loading">Loading…</div>;
  return (
    <div className="arasul-image-viewer">
      <img src={src} alt={filePath} />
    </div>
  );
}

// ---------------- MediaViewer ----------------

function MediaViewer({ filePath, mime, kind }: { filePath: string; mime: string; kind: "audio" | "video" }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const b64 = await invoke<string>("read_file_bytes", { path: filePath });
        if (cancelled) return;
        setSrc(`data:${mime};base64,${b64}`);
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [filePath, mime]);

  if (error) return <div className="arasul-viewer-error">Media error: {error}</div>;
  if (!src) return <div className="arasul-viewer-loading">Loading…</div>;
  return (
    <div className={"arasul-media-viewer arasul-media-" + kind}>
      {kind === "audio"
        ? <audio src={src} controls />
        : <video src={src} controls />}
    </div>
  );
}

// ---------------- CsvViewer (papaparse) ----------------

function CsvViewer({ filePath, separator }: { filePath: string; separator: string }) {
  const [rows, setRows] = useState<string[][] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const Papa = (await import("papaparse")).default;
        const text = await invoke<string>("read_file", { path: filePath });
        if (cancelled) return;
        const parsed = Papa.parse<string[]>(text, { delimiter: separator, skipEmptyLines: true });
        setRows(parsed.data);
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [filePath, separator]);

  if (error) return <div className="arasul-viewer-error">CSV error: {error}</div>;
  if (!rows) return <div className="arasul-viewer-loading">Loading…</div>;

  const header = rows[0] ?? [];
  const body = rows.slice(1);

  return (
    <div className="arasul-csv-scroller">
      <table className="arasul-csv-table">
        <thead>
          <tr>
            <th className="arasul-csv-rownum"></th>
            {header.map((h, i) => <th key={i}>{h || `col ${i + 1}`}</th>)}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri}>
              <td className="arasul-csv-rownum">{ri + 1}</td>
              {row.map((c, ci) => <td key={ci}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------- DocxViewer (mammoth → sanitized HTML) ----------------

function DocxViewer({ filePath }: { filePath: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [{ default: mammoth }, { default: DOMPurify }] = await Promise.all([
          import("mammoth"),
          import("dompurify"),
        ]);
        const b64 = await invoke<string>("read_file_bytes", { path: filePath });
        if (cancelled) return;
        const bin = atob(b64);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        const result = await mammoth.convertToHtml({ arrayBuffer: arr.buffer });
        if (cancelled) return;
        const safe = DOMPurify.sanitize(result.value, { USE_PROFILES: { html: true } });
        setHtml(safe);
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [filePath]);

  if (error) return <div className="arasul-viewer-error">DOCX error: {error}</div>;
  if (html === null) return <div className="arasul-viewer-loading">Loading…</div>;
  return (
    <div className="arasul-docx-scroller">
      <div
        className="arasul-docx-inner"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

// ---------------- UnsupportedViewer ----------------

function UnsupportedViewer({ filePath, fileName }: { filePath: string; fileName: string }) {
  const [revealing, setRevealing] = useState(false);
  const onReveal = async () => {
    setRevealing(true);
    try { await invoke("reveal_in_finder", { path: filePath }); }
    catch (e) { console.error("reveal_in_finder failed:", e); }
    finally { setRevealing(false); }
  };
  return (
    <div className="arasul-unsupported">
      <div className="arasul-unsupported-title">{fileName}</div>
      <div className="arasul-unsupported-hint">
        Preview for this format isn't built yet.
      </div>
      <button className="arasul-unsupported-btn" onClick={onReveal} disabled={revealing}>
        {revealing ? "Opening…" : "Reveal in Finder"}
      </button>
    </div>
  );
}

// ---------------- DropOverlay + ConflictModal ----------------

function DropOverlay() {
  return (
    <div className="arasul-drop-overlay" aria-hidden="true">
      <div className="arasul-drop-card">
        <Upload size={28} />
        <div>Drop file to import into project</div>
      </div>
    </div>
  );
}

function ConflictModal({ existing, onReplace, onKeepBoth, onCancel }: {
  existing: string;
  onReplace: () => void;
  onKeepBoth: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="arasul-conflict-overlay" onClick={onCancel}>
      <div className="arasul-conflict" onClick={(e) => e.stopPropagation()}>
        <h3>File already exists</h3>
        <p className="arasul-muted-sm">{existing}</p>
        <div className="arasul-conflict-actions">
          <button className="arasul-btn ghost" onClick={onCancel}>Cancel</button>
          <button className="arasul-btn ghost" onClick={onKeepBoth}>Keep both</button>
          <button className="arasul-btn primary" onClick={onReplace}>Replace</button>
        </div>
      </div>
    </div>
  );
}

function errorMessage(e: unknown): string {
  if (typeof e === "object" && e && "message" in e) return String((e as { message: unknown }).message);
  if (typeof e === "object" && e && "kind" in e) return String((e as { kind: unknown }).kind);
  return String(e);
}
