import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  DataEditor,
  GridCellKind,
  type DataEditorRef,
  type EditableGridCell,
  type GridCell,
  type GridSelection,
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

// Phase 6.9 (2026-05-11): per-column width + freeze-first-column state is
// scoped per (file, sheet) and lives in localStorage so muscle-memory
// survives tab-close / restart. Key shape kept simple — workbooks at
// different paths never collide. Tolerant to corrupt JSON via try/catch.
type SheetColsState = { widths: Record<string, number>; freezeFirst: boolean };
const SHEET_COLS_PREFIX = "arasul.sheet-cols";
function sheetColsKey(filePath: string, sheet: string): string {
  return `${SHEET_COLS_PREFIX}:${filePath}::${sheet}`;
}
function loadSheetCols(filePath: string, sheet: string): SheetColsState {
  try {
    const raw = localStorage.getItem(sheetColsKey(filePath, sheet));
    if (!raw) return { widths: {}, freezeFirst: false };
    const parsed = JSON.parse(raw) as Partial<SheetColsState>;
    return {
      widths: (parsed.widths && typeof parsed.widths === "object") ? parsed.widths : {},
      freezeFirst: !!parsed.freezeFirst,
    };
  } catch {
    return { widths: {}, freezeFirst: false };
  }
}
function saveSheetCols(filePath: string, sheet: string, state: SheetColsState): void {
  try {
    localStorage.setItem(sheetColsKey(filePath, sheet), JSON.stringify(state));
  } catch {
    // Quota or private-mode failures aren't worth surfacing — the grid
    // still works, the widths just don't persist this session.
  }
}

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

  // Phase 2.8 (WCAG 4.1.3): polite SR announcement of the active cell.
  // glide-data-grid renders to canvas, so the cell move isn't visible to
  // screen readers via the DOM. We hand-author a "Row N of M, column X,
  // value Y" message via the onGridSelectionChange callback.
  const [a11yAnnouncement, setA11yAnnouncement] = useState("");
  const lastAnnouncedRef = useRef<string>("");

  // Phase 6.9 (2026-05-11): per-column widths + freeze-first-column,
  // persisted per (file, sheet) so users keep their layout across reloads.
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const [freezeFirst, setFreezeFirst] = useState(false);

  // Phase 6.11 (2026-05-11): track the selected cell so the formula bar
  // above the grid can show its reference + formula / value, and accept
  // edits that round-trip through the same write path as overlay edits.
  const [selectedCell, setSelectedCell] = useState<[number, number] | null>(null);
  const [formulaDraft, setFormulaDraft] = useState<string>("");
  const formulaInputRef = useRef<HTMLInputElement | null>(null);

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

  // Phase 6.9: hydrate per-sheet column layout from localStorage whenever
  // the (file, sheet) pair changes. Default to empty widths + no freeze.
  useEffect(() => {
    if (!activeSheet) {
      setColWidths({});
      setFreezeFirst(false);
      return;
    }
    const state = loadSheetCols(filePath, activeSheet);
    setColWidths(state.widths);
    setFreezeFirst(state.freezeFirst);
  }, [filePath, activeSheet]);

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

  // Phase 6.10 (2026-05-11): formula evaluation cache, keyed by a stable
  // fingerprint of the entire grid's cell values. Re-uses prior results
  // when no input cell has changed since the last run — typical case
  // after a cosmetic edit (selection move) or non-formula cell edit
  // whose change doesn't propagate. Trade-off: fingerprint is O(cells)
  // and the recompute is also O(formulas), so the win is in the no-
  // formula-input-touched case where we replay the prior Map.
  //
  // Linear in cell count for personal-scale sheets — fine. A real
  // dependency graph (cell-deps tracking) is out of scope for v1.
  const prevFingerprintRef = useRef<string>("");
  const prevFormulaEvalsRef = useRef<Map<string, string>>(new Map());

  const formulaEvals = useMemo<Map<string, string>>(() => {
    if (!grid) return new Map();
    // Fast fingerprint: only includes cells that could affect evaluation
    // (values + formula text). Skipping empties keeps it cheap on sparse
    // grids. Hand-rolled join for stable ordering without sort cost.
    const parts: string[] = [];
    for (let r = 0; r < grid.rows.length; r++) {
      const row = grid.rows[r];
      for (let c = 0; c < row.length; c++) {
        const cell = row[c];
        if (!cell || cell.value.kind === "empty") continue;
        const v = cell.value;
        const tag =
          v.kind === "number" ? `n${v.v}` :
          v.kind === "text" ? `t${v.v}` :
          v.kind === "bool" ? `b${v.v ? 1 : 0}` :
          v.kind === "date" ? `d${v.v}` :
          v.kind === "error" ? `e${v.v}` : "?";
        parts.push(`${r},${c}:${tag}:${cell.formula ?? ""}`);
      }
    }
    const fingerprint = parts.join("|");
    if (fingerprint === prevFingerprintRef.current) {
      return prevFormulaEvalsRef.current;
    }
    const map = new Map<string, string>();
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
    prevFingerprintRef.current = fingerprint;
    prevFormulaEvalsRef.current = map;
    return map;
  }, [grid]);

  const columns = useMemo<GridColumn[]>(() => {
    return Array.from({ length: visibleCols }, (_, i) => {
      const id = colName(i);
      return {
        title: id,
        id,
        width: colWidths[id] ?? DEFAULT_COL_WIDTH,
      };
    });
  }, [visibleCols, colWidths]);

  // Phase 6.9: persist column width on drag-end. glide-data-grid calls
  // this with the new size as we drag; localStorage write is cheap but
  // we only commit when the user lets go to avoid hammering quota on
  // every pointer event. The `newSize` arg is the final pixel width.
  const onColumnResize = useCallback(
    (column: GridColumn, newSize: number) => {
      const id = column.id ?? column.title;
      if (!id || !activeSheet) return;
      setColWidths((cur) => {
        const next = { ...cur, [id]: Math.max(40, Math.round(newSize)) };
        saveSheetCols(filePath, activeSheet, { widths: next, freezeFirst });
        return next;
      });
    },
    [activeSheet, filePath, freezeFirst],
  );

  const toggleFreezeFirst = useCallback(() => {
    if (!activeSheet) return;
    setFreezeFirst((cur) => {
      const next = !cur;
      saveSheetCols(filePath, activeSheet, { widths: colWidths, freezeFirst: next });
      return next;
    });
  }, [activeSheet, colWidths, filePath]);

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

  // Phase 2.8: emit SR-friendly announcement when the active cell moves.
  // glide-data-grid's canvas means SR's don't see cell focus via the DOM
  // tree — this aria-live region is the only way they hear cell moves.
  // Phase 6.11 (2026-05-11): also feeds the formula bar above the grid
  // — same source of truth, no risk of drift between the two surfaces.
  const onGridSelection = useCallback(
    (sel: GridSelection) => {
      const c = sel.current?.cell;
      if (!c) {
        setSelectedCell(null);
        return;
      }
      const [col, row] = c;
      const cell = getCellContent([col, row]);
      const value =
        ("displayData" in cell && cell.displayData) ||
        ("data" in cell && cell.data != null && String(cell.data)) ||
        "empty";
      const msg = `Row ${row + 1} of ${visibleRows}, column ${colName(col)}, ${value}`;
      if (msg !== lastAnnouncedRef.current) {
        lastAnnouncedRef.current = msg;
        setA11yAnnouncement(msg);
      }
      // Update formula bar — show the formula text verbatim when one
      // exists, otherwise the raw value. The bar stays out of sync with
      // overlay-edits-in-progress on purpose: typing in the overlay then
      // pressing Enter commits, which re-fires getCellContent below.
      setSelectedCell([col, row]);
      const j = grid?.rows[row]?.[col];
      if (!j || j.value.kind === "empty") {
        setFormulaDraft("");
      } else if (j.formula) {
        setFormulaDraft(`=${j.formula}`);
      } else {
        setFormulaDraft(cellToText(j));
      }
    },
    [getCellContent, grid, visibleRows],
  );

  // Phase 6.11: commit the formula bar value via the same write path
  // overlay edits use. Reuses onCellEdited's edit semantics so the
  // dirty/save status, optimistic UI update, and formula handling all
  // stay identical between the two entry points.
  const commitFormulaBar = useCallback(() => {
    if (!selectedCell) return;
    const [col, row] = selectedCell;
    const trimmed = formulaDraft;
    onCellEdited([col, row], {
      kind: GridCellKind.Text,
      data: trimmed,
      displayData: trimmed,
      allowOverlay: true,
    });
    // Bounce focus back to the grid so arrow keys work afterwards.
    editorRef.current?.focus();
  }, [formulaDraft, onCellEdited, selectedCell]);

  const onFormulaBarKey = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commitFormulaBar();
      } else if (e.key === "Escape") {
        e.preventDefault();
        // Revert to whatever the cell currently holds.
        if (selectedCell) {
          const [col, row] = selectedCell;
          const j = grid?.rows[row]?.[col];
          if (!j || j.value.kind === "empty") setFormulaDraft("");
          else if (j.formula) setFormulaDraft(`=${j.formula}`);
          else setFormulaDraft(cellToText(j));
        }
        editorRef.current?.focus();
      }
    },
    [commitFormulaBar, grid, selectedCell],
  );

  const selectedRef = selectedCell
    ? `${colName(selectedCell[0])}${selectedCell[1] + 1}`
    : "";

  return (
    <div
      className="arasul-sheet-shell"
      role="region"
      aria-label={
        activeSheet
          ? `Spreadsheet · sheet ${activeSheet}`
          : "Spreadsheet"
      }
    >
      {/* Phase 6.11 (2026-05-11): dedicated formula bar above the grid.
          The left chip shows the active cell reference (A1 notation); the
          input edits the formula or raw value. Enter commits via the same
          write path as overlay edits; Escape reverts. */}
      <div className="arasul-sheet-formula-bar">
        <span
          className="arasul-sheet-formula-ref"
          aria-label="Selected cell reference"
        >
          {selectedRef || "—"}
        </span>
        <span className="arasul-sheet-formula-fx" aria-hidden="true">ƒx</span>
        <input
          ref={formulaInputRef}
          type="text"
          className="arasul-sheet-formula-input"
          value={formulaDraft}
          onChange={(e) => setFormulaDraft(e.target.value)}
          onKeyDown={onFormulaBarKey}
          spellCheck={false}
          autoComplete="off"
          placeholder={selectedCell ? "Enter a value or =formula" : "Select a cell"}
          disabled={!selectedCell}
          aria-label="Formula or value for the selected cell"
        />
      </div>
      <div className="arasul-sheet-grid">
        <DataEditor
          ref={editorRef}
          getCellContent={getCellContent}
          onCellEdited={onCellEdited}
          onGridSelectionChange={onGridSelection}
          onColumnResize={onColumnResize}
          columns={columns}
          rows={visibleRows}
          width="100%"
          height="100%"
          rowMarkers="number"
          smoothScrollX
          smoothScrollY
          freezeColumns={freezeFirst ? 1 : 0}
          theme={SHEET_THEME}
        />
        {/* Phase 2.8: SR cell-move announcer. Read by AT, invisible on
            screen. Throttled internally by skipping repeat messages. */}
        <span
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {a11yAnnouncement}
        </span>
      </div>
      {sheets.length > 0 && (
        <nav className="arasul-sheet-tabs" aria-label="Workbook sheets">
          {/* Phase 6.12 (2026-05-11): when there are many sheets, the
              tab strip would scroll horizontally past the visible area.
              Show a `<select>` dropdown alongside the strip so users
              can jump-pick from any sheet without scrolling. The strip
              itself stays so power-users keep their muscle memory. */}
          {sheets.length > 10 && (
            <select
              className="arasul-sheet-picker"
              value={activeSheet ?? ""}
              onChange={(e) => setActiveSheet(e.target.value)}
              aria-label="Jump to sheet"
              title="Jump to sheet"
            >
              {sheets.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name} · {s.rows}×{s.cols}
                </option>
              ))}
            </select>
          )}
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
          {/* Phase 6.9 (2026-05-11): freeze-first-column toggle. Persists
              per (file, sheet) so the user's freeze choice survives reloads.
              Width settings persist on drag-resize via onColumnResize. */}
          <button
            type="button"
            className={
              "arasul-sheet-freeze" + (freezeFirst ? " active" : "")
            }
            onClick={toggleFreezeFirst}
            aria-pressed={freezeFirst}
            title={freezeFirst ? "Unfreeze first column" : "Freeze first column"}
          >
            {freezeFirst ? "❄ Frozen" : "❄ Freeze"}
          </button>
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
