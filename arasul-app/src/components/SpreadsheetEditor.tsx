import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  DataEditor,
  GridCellKind,
  type DataEditorRef,
  type EditableGridCell,
  type GridCell,
  type Item,
  type GridColumn,
} from "@glideapps/glide-data-grid";
import "@glideapps/glide-data-grid/dist/index.css";
import { notify } from "../lib/toast";
import { evaluate, resultToDisplay, type EvalContext, type FormulaCellValue } from "../lib/formulaEngine";
import "./SpreadsheetEditor.css";

// ---------------- Backend types ----------------

type CellValue =
  | { kind: "empty" }
  | { kind: "text"; v: string }
  | { kind: "number"; v: number }
  | { kind: "bool"; v: boolean }
  | { kind: "date"; v: string }
  | { kind: "error"; v: string };

type JsonCell = { value: CellValue; formula?: string };

type CellGrid = {
  rows: JsonCell[][];
  max_col: number;
  max_row: number;
};

type SheetMeta = { name: string; rows: number; cols: number };

type OpenResult = { handle: string; sheets: SheetMeta[] };

type CellEdit = {
  row: number;
  col: number;
  value: string | number | boolean | null;
  formula?: string;
};

type SaveStatus = "clean" | "dirty" | "saving" | "saved" | "error";

const SAVE_DEBOUNCE_MS = 1500;

// ---------------- Helpers ----------------

function colName(idx: number): string {
  let n = idx;
  let s = "";
  while (true) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
    if (n < 0) break;
  }
  return s;
}

function cellToText(c: JsonCell): string {
  switch (c.value.kind) {
    case "empty": return "";
    case "text": return c.value.v;
    case "number": return Number.isInteger(c.value.v)
      ? String(c.value.v)
      : c.value.v.toLocaleString(undefined, { maximumFractionDigits: 8 });
    case "bool": return c.value.v ? "TRUE" : "FALSE";
    case "date": return c.value.v;
    case "error": return `#${c.value.v}`;
  }
}

// ---------------- Component ----------------

type Props = { filePath: string };

const MIN_VISIBLE_COLS = 12;
const MIN_VISIBLE_ROWS = 50;
const DEFAULT_COL_WIDTH = 140;

export function SpreadsheetEditor({ filePath }: Props) {
  const editorRef = useRef<DataEditorRef>(null);
  const [handle, setHandle] = useState<string | null>(null);
  const [sheets, setSheets] = useState<SheetMeta[]>([]);
  const [activeSheet, setActiveSheet] = useState<string | null>(null);
  const [grid, setGrid] = useState<CellGrid | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<SaveStatus>("clean");
  const handleRef = useRef<string | null>(null);
  const saveTimer = useRef<number | null>(null);
  // Status reset timer — separate so transitions like saving→saved→clean
  // don't fight a save that arrived in between.
  const statusTimer = useRef<number | null>(null);

  // Open the workbook on mount; close on unmount.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setGrid(null);
    setHandle(null);
    setSheets([]);
    setActiveSheet(null);

    (async () => {
      try {
        const result = await invoke<OpenResult>("workbook_open", {
          args: { path: filePath },
        });
        if (cancelled) return;
        setHandle(result.handle);
        handleRef.current = result.handle;
        setSheets(result.sheets);
        setActiveSheet(result.sheets[0]?.name ?? null);
      } catch (e) {
        if (!cancelled) {
          setError(typeof e === "string" ? e : (e as { message?: string })?.message ?? String(e));
          notify.err("Couldn't open workbook", e);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      const h = handleRef.current;
      if (h) {
        void invoke("workbook_close", { args: { handle: h } }).catch(() => { /* best-effort */ });
        handleRef.current = null;
      }
    };
  }, [filePath]);

  // Load the active sheet's grid whenever it changes.
  useEffect(() => {
    if (!handle || !activeSheet) return;
    let cancelled = false;
    (async () => {
      try {
        const g = await invoke<CellGrid>("workbook_read_range", {
          args: { handle, sheet: activeSheet },
        });
        if (!cancelled) setGrid(g);
      } catch (e) {
        if (!cancelled) notify.err("Couldn't read sheet", e);
      }
    })();
    return () => { cancelled = true; };
  }, [handle, activeSheet]);

  // ---------------- Save path ----------------

  const saveNow = useCallback(async () => {
    if (!handle) return;
    if (statusTimer.current) { window.clearTimeout(statusTimer.current); statusTimer.current = null; }
    setStatus("saving");
    try {
      await invoke("workbook_save", { args: { handle } });
      setStatus("saved");
      statusTimer.current = window.setTimeout(() => {
        setStatus((s) => (s === "saved" ? "clean" : s));
      }, 1500);
    } catch (e) {
      setStatus("error");
      notify.err("Couldn't save workbook", e);
    }
  }, [handle]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      void saveNow();
    }, SAVE_DEBOUNCE_MS);
  }, [saveNow]);

  // ⌘S — flush immediately (path-bound to current handle).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.shiftKey) return;
      if (e.key.toLowerCase() !== "s") return;
      if (!handle) return;
      const target = e.target as HTMLElement | null;
      const inGrid = !!target?.closest?.(".arasul-sheet-shell");
      if (!inGrid) return;
      e.preventDefault();
      if (saveTimer.current) { window.clearTimeout(saveTimer.current); saveTimer.current = null; }
      void saveNow();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handle, saveNow]);

  // Final flush on unmount — same contract as MarkdownEditor's path-bound
  // closure: a pending debounce becomes an immediate save before the
  // session is closed by the open-effect cleanup.
  useEffect(() => {
    return () => {
      if (!handle) return;
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
        void invoke("workbook_save", { args: { handle } }).catch((e) =>
          notify.err("Couldn't flush pending save", e),
        );
      }
      if (statusTimer.current) {
        window.clearTimeout(statusTimer.current);
        statusTimer.current = null;
      }
    };
  }, [handle]);

  // ---------------- Edit path ----------------

  const onCellEdited = useCallback(
    (cell: Item, newValue: EditableGridCell) => {
      if (!handle || !activeSheet) return;
      const [col, row] = cell;
      let value: string | number | boolean | null = null;
      let formula: string | undefined;
      switch (newValue.kind) {
        case GridCellKind.Number:
          value = (newValue.data as number | undefined) ?? null;
          break;
        case GridCellKind.Boolean:
          value = !!newValue.data;
          break;
        case GridCellKind.Text:
        case GridCellKind.Markdown:
        case GridCellKind.Uri: {
          const text = (newValue.data as string | undefined) ?? "";
          if (text.startsWith("=")) {
            // User typed a formula. Preserve verbatim — the mini-eval
            // engine (P2.11) computes the display value; the formula is
            // what we save into the .xlsx.
            formula = text.slice(1).trim();
            value = formula; // placeholder display until eval lands
          } else {
            // Coerce numeric-looking strings to numbers so the saved xlsx
            // gets typed cells (and downstream Excel formulas can sum them).
            const n = Number(text);
            value = text !== "" && !Number.isNaN(n) ? n : text;
          }
          break;
        }
        default:
          // Other kinds (Loading, Bubble, Drilldown, Image, RowID, Custom)
          // aren't editable in our v1 grid — bail rather than corrupt state.
          return;
      }
      // Optimistic UI update: mutate the in-memory grid so the next render
      // shows the new value without a round-trip read.
      setGrid((cur) => {
        if (!cur) return cur;
        const next = { ...cur, rows: cur.rows.map((r) => r.slice()) };
        while (next.rows.length <= row) next.rows.push([]);
        const r = next.rows[row];
        while (r.length <= col) {
          r.push({ value: { kind: "empty" } });
        }
        if (formula !== undefined) {
          r[col] = {
            value: typeof value === "number"
              ? { kind: "number", v: value }
              : { kind: "text", v: String(value ?? "") },
            formula,
          };
        } else if (value === null || value === "") {
          r[col] = { value: { kind: "empty" } };
        } else if (typeof value === "number") {
          r[col] = { value: { kind: "number", v: value } };
        } else if (typeof value === "boolean") {
          r[col] = { value: { kind: "bool", v: value } };
        } else {
          r[col] = { value: { kind: "text", v: String(value) } };
        }
        if (col + 1 > next.max_col) next.max_col = col + 1;
        if (row + 1 > next.max_row) next.max_row = row + 1;
        return next;
      });
      setStatus("dirty");
      const edits: CellEdit[] = [{ row, col, value, formula }];
      void invoke("workbook_write_cells", {
        args: { handle, sheet: activeSheet, edits },
      })
        .then(() => scheduleSave())
        .catch((e) => {
          setStatus("error");
          notify.err("Couldn't write cell", e);
        });
    },
    [handle, activeSheet, scheduleSave],
  );

  const visibleCols = Math.max(grid?.max_col ?? 0, MIN_VISIBLE_COLS);
  const visibleRows = Math.max(grid?.max_row ?? 0, MIN_VISIBLE_ROWS);

  // Precompute formula display values once per grid change. Linear in
  // formula count — fine for personal-scale sheets. Re-runs when any cell
  // changes (`grid` is a fresh object after every edit). Keyed by
  // "row,col" rather than by ref because edits can shrink/grow the grid.
  const formulaEvals = useMemo<Map<string, string>>(() => {
    const map = new Map<string, string>();
    if (!grid) return map;
    const ctx: EvalContext = {
      getCell(row, col) {
        const j = grid.rows[row]?.[col];
        if (!j) return { kind: "empty" };
        return j.value as FormulaCellValue;
      },
    };
    for (let r = 0; r < grid.rows.length; r++) {
      const row = grid.rows[r];
      for (let c = 0; c < row.length; c++) {
        const f = row[c].formula;
        if (!f) continue;
        const result = evaluate(f, ctx);
        map.set(`${r},${c}`, resultToDisplay(result));
      }
    }
    return map;
  }, [grid]);

  const columns = useMemo<GridColumn[]>(() => {
    return Array.from({ length: visibleCols }, (_, i) => ({
      title: colName(i),
      width: DEFAULT_COL_WIDTH,
      id: colName(i),
    }));
  }, [visibleCols]);

  const getCellContent = useCallback(
    (cell: Item): GridCell => {
      const [col, row] = cell;
      const j = grid?.rows[row]?.[col];
      if (!j || j.value.kind === "empty") {
        return {
          kind: GridCellKind.Text,
          data: "",
          displayData: "",
          allowOverlay: true,
        };
      }
      // Cells with formulas: edit-data is the formula text, display-data
      // is the live evaluation result from the mini-engine.
      if (j.formula) {
        const evaluated = formulaEvals.get(`${row},${col}`);
        const display = evaluated ?? cellToText(j) ?? `=${j.formula}`;
        return {
          kind: GridCellKind.Text,
          data: `=${j.formula}`,
          displayData: display,
          allowOverlay: true,
        };
      }
      const text = cellToText(j);
      if (j.value.kind === "number") {
        return {
          kind: GridCellKind.Number,
          data: j.value.v,
          displayData: text,
          allowOverlay: true,
          contentAlign: "right",
        };
      }
      if (j.value.kind === "bool") {
        return {
          kind: GridCellKind.Boolean,
          data: j.value.v,
          allowOverlay: false,
        };
      }
      return {
        kind: GridCellKind.Text,
        data: text,
        displayData: text,
        allowOverlay: true,
      };
    },
    [grid],
  );

  // ---------------- Render ----------------

  if (error) {
    return (
      <div className="arasul-sheet-error">
        <p>Couldn't open this workbook.</p>
        <p className="arasul-sheet-error-detail">{error}</p>
      </div>
    );
  }

  if (loading || !grid) {
    return <div className="arasul-sheet-loading">Loading workbook…</div>;
  }

  return (
    <div className="arasul-sheet-shell">
      <div className="arasul-sheet-grid">
        <DataEditor
          ref={editorRef}
          getCellContent={getCellContent}
          onCellEdited={onCellEdited}
          columns={columns}
          rows={visibleRows}
          width="100%"
          height="100%"
          rowMarkers="number"
          smoothScrollX
          smoothScrollY
          theme={SHEET_THEME}
        />
      </div>
      {sheets.length > 0 && (
        <nav className="arasul-sheet-tabs" aria-label="Workbook sheets">
          {sheets.map((s) => (
            <button
              type="button"
              key={s.name}
              className={"arasul-sheet-tab" + (s.name === activeSheet ? " active" : "")}
              onClick={() => setActiveSheet(s.name)}
              title={`${s.name} · ${s.rows}×${s.cols}`}
            >
              {s.name}
            </button>
          ))}
          <span className={"arasul-sheet-status arasul-sheet-status-" + status}>
            {status === "saving" ? "saving…" :
             status === "saved" ? "saved" :
             status === "dirty" ? "unsaved" :
             status === "error" ? "save failed" :
             ""}
          </span>
        </nav>
      )}
    </div>
  );
}

// glide-data-grid theme aligned to Arasul's design tokens. We can't read
// CSS vars at module init, so we hardcode the dark palette here. Light
// theme support arrives with the toolbar (next iteration).
const SHEET_THEME = {
  accentColor: "#7C8FFC",
  accentLight: "rgba(124, 143, 252, 0.13)",
  textDark: "#E6E8EC",
  textMedium: "#9AA0AB",
  textLight: "#636976",
  textBubble: "#E6E8EC",
  bgIconHeader: "#9AA0AB",
  fgIconHeader: "#0E0F11",
  textHeader: "#9AA0AB",
  textGroupHeader: "#9AA0AB",
  textHeaderSelected: "#E6E8EC",
  bgCell: "#0E0F11",
  bgCellMedium: "#15171B",
  bgHeader: "#15171B",
  bgHeaderHasFocus: "#1C1F25",
  bgHeaderHovered: "#1C1F25",
  bgBubble: "#15171B",
  bgBubbleSelected: "#1C1F25",
  bgSearchResult: "rgba(124, 143, 252, 0.13)",
  borderColor: "#232730",
  drilldownBorder: "#303640",
  linkColor: "#7C8FFC",
  cellHorizontalPadding: 10,
  cellVerticalPadding: 4,
  headerFontStyle: "600 12px",
  baseFontStyle: "13px",
  fontFamily: "Geist, Inter, -apple-system, BlinkMacSystemFont, sans-serif",
};
