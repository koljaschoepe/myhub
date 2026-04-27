//! Workbook (.xlsx) — Phase 2 of vision-v3 spreadsheet axis.
//!
//! Architecture:
//!   - calamine reads .xlsx into `Sheet { rows: Vec<Vec<Cell>> }`.
//!   - rust_xlsxwriter writes the in-memory state back as a fresh .xlsx.
//!   - Sessions are keyed by UUID; the frontend gets a handle on
//!     `workbook_open`, passes it back to every subsequent call.
//!   - Cells track value + formula + dirty bit so unedited formulas survive
//!     round-trip even when the writer-side library can't reuse the input.
//!
//! v1 simplifications (locked 2026-04-26):
//!   - Read values only, no formula preservation across round-trip yet
//!     (planned for the write-path commit). Formulas typed by the user are
//!     stored as plain text in v1's read-path; the frontend mini-engine
//!     evaluates them for display.
//!   - No formatting, no charts, no images, no merged cells. Cells in/out.
//!   - CSV-mirror generated on save (separate command in this module).

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use calamine::{open_workbook_auto, Data, Reader};
use parking_lot::Mutex;
use rust_xlsxwriter::Workbook as XWorkbook;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::ipc::error::{ArasulError, Result};

// ---------------- Data model ----------------

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum CellValue {
    Empty,
    Text { v: String },
    Number { v: f64 },
    Bool { v: bool },
    Date { v: String },
    Error { v: String },
}

impl CellValue {
    fn from_calamine(d: &Data) -> Self {
        match d {
            Data::Empty => CellValue::Empty,
            Data::String(s) => CellValue::Text { v: s.clone() },
            Data::Float(f) => CellValue::Number { v: *f },
            Data::Int(i) => CellValue::Number { v: *i as f64 },
            Data::Bool(b) => CellValue::Bool { v: *b },
            Data::DateTime(dt) => CellValue::Date { v: dt.to_string() },
            Data::DateTimeIso(s) => CellValue::Date { v: s.clone() },
            Data::DurationIso(s) => CellValue::Text { v: s.clone() },
            Data::Error(e) => CellValue::Error { v: format!("{e:?}") },
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct JsonCell {
    pub value: CellValue,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub formula: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CellGrid {
    pub rows: Vec<Vec<JsonCell>>,
    pub max_col: usize,
    pub max_row: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct SheetMeta {
    pub name: String,
    pub rows: usize,
    pub cols: usize,
}

// ---------------- Internal session state ----------------

#[derive(Debug, Clone)]
struct Cell {
    value: CellValue,
    formula: Option<String>,
}

#[derive(Debug)]
struct Sheet {
    name: String,
    rows: Vec<Vec<Cell>>,
    max_col: usize,
}

#[derive(Debug)]
pub struct WorkbookSession {
    path: PathBuf,
    sheets: Vec<Sheet>,
}

// ---------------- Public state for Tauri ----------------

#[derive(Default, Clone)]
pub struct WorkbookState {
    inner: Arc<Mutex<HashMap<String, WorkbookSession>>>,
}

impl WorkbookState {
    pub fn new() -> Self { Self::default() }
}

// ---------------- IPC commands ----------------

#[derive(Debug, Deserialize)]
pub struct OpenArgs {
    pub path: String,
}

#[derive(Debug, Serialize)]
pub struct OpenResult {
    pub handle: String,
    pub sheets: Vec<SheetMeta>,
}

#[tauri::command]
pub fn workbook_open(
    state: tauri::State<'_, WorkbookState>,
    args: OpenArgs,
) -> Result<OpenResult> {
    let path = PathBuf::from(&args.path);
    if !path.exists() {
        return Err(ArasulError::Internal {
            message: format!("workbook not found: {}", path.display()),
        });
    }

    let mut wb = open_workbook_auto(&path).map_err(|e| ArasulError::Internal {
        message: format!("workbook open: {e}"),
    })?;

    let names: Vec<String> = wb.sheet_names().to_vec();
    if names.is_empty() {
        return Err(ArasulError::Internal {
            message: "workbook has no sheets".into(),
        });
    }

    let mut sheets: Vec<Sheet> = Vec::with_capacity(names.len());
    let mut metas: Vec<SheetMeta> = Vec::with_capacity(names.len());

    for name in &names {
        let range = wb.worksheet_range(name).map_err(|e| ArasulError::Internal {
            message: format!("read sheet '{name}': {e}"),
        })?;
        // Best-effort formula read. If the sheet has no formulas calamine
        // returns an empty range; we tolerate any error here too — losing
        // formula preservation is degraded UX, not a blocker.
        let formulas = wb.worksheet_formula(name).ok();
        let mut rows: Vec<Vec<Cell>> = Vec::with_capacity(range.height());
        let mut max_col = 0usize;
        for (r, row) in range.rows().enumerate() {
            let mapped: Vec<Cell> = row
                .iter()
                .enumerate()
                .map(|(c, d)| {
                    let formula = formulas
                        .as_ref()
                        .and_then(|fr| fr.get_value((r as u32, c as u32)))
                        .filter(|s| !s.is_empty())
                        .cloned();
                    Cell {
                        value: CellValue::from_calamine(d),
                        formula,
                    }
                })
                .collect();
            max_col = max_col.max(mapped.len());
            rows.push(mapped);
        }
        let row_count = rows.len();
        metas.push(SheetMeta {
            name: name.clone(),
            rows: row_count,
            cols: max_col,
        });
        sheets.push(Sheet {
            name: name.clone(),
            rows,
            max_col,
        });
    }

    let handle = Uuid::new_v4().to_string();
    state.inner.lock().insert(
        handle.clone(),
        WorkbookSession { path, sheets },
    );

    Ok(OpenResult { handle, sheets: metas })
}

#[derive(Debug, Deserialize)]
pub struct ListSheetsArgs {
    pub handle: String,
}

#[tauri::command]
pub fn workbook_list_sheets(
    state: tauri::State<'_, WorkbookState>,
    args: ListSheetsArgs,
) -> Result<Vec<SheetMeta>> {
    let inner = state.inner.lock();
    let session = inner.get(&args.handle).ok_or_else(|| ArasulError::Internal {
        message: "unknown workbook handle".into(),
    })?;
    Ok(session
        .sheets
        .iter()
        .map(|s| SheetMeta {
            name: s.name.clone(),
            rows: s.rows.len(),
            cols: s.max_col,
        })
        .collect())
}

#[derive(Debug, Deserialize)]
pub struct ReadRangeArgs {
    pub handle: String,
    pub sheet: String,
    /// Optional range. None = whole sheet. Format: zero-based [row, col, row_end, col_end].
    /// row_end + col_end are exclusive.
    #[serde(default)]
    pub range: Option<[usize; 4]>,
}

#[tauri::command]
pub fn workbook_read_range(
    state: tauri::State<'_, WorkbookState>,
    args: ReadRangeArgs,
) -> Result<CellGrid> {
    let inner = state.inner.lock();
    let session = inner.get(&args.handle).ok_or_else(|| ArasulError::Internal {
        message: "unknown workbook handle".into(),
    })?;
    let sheet = session
        .sheets
        .iter()
        .find(|s| s.name == args.sheet)
        .ok_or_else(|| ArasulError::Internal {
            message: format!("no sheet '{}'", args.sheet),
        })?;

    let (r0, c0, r1, c1) = match args.range {
        Some([r0, c0, r1, c1]) => (
            r0,
            c0,
            r1.min(sheet.rows.len()),
            c1.min(sheet.max_col),
        ),
        None => (0, 0, sheet.rows.len(), sheet.max_col),
    };

    let mut out_rows: Vec<Vec<JsonCell>> = Vec::with_capacity(r1.saturating_sub(r0));
    for r in r0..r1 {
        let row = sheet.rows.get(r);
        let mut out_row: Vec<JsonCell> = Vec::with_capacity(c1.saturating_sub(c0));
        for c in c0..c1 {
            let cell = row.and_then(|r| r.get(c));
            out_row.push(JsonCell {
                value: cell.map(|c| c.value.clone()).unwrap_or(CellValue::Empty),
                formula: cell.and_then(|c| c.formula.clone()),
            });
        }
        out_rows.push(out_row);
    }

    Ok(CellGrid {
        rows: out_rows,
        max_col: c1.saturating_sub(c0),
        max_row: r1.saturating_sub(r0),
    })
}

#[derive(Debug, Deserialize)]
pub struct CloseArgs {
    pub handle: String,
}

#[tauri::command]
pub fn workbook_close(
    state: tauri::State<'_, WorkbookState>,
    args: CloseArgs,
) -> Result<()> {
    state.inner.lock().remove(&args.handle);
    Ok(())
}

// ---------------- Write path ----------------

/// Edit payload from the frontend grid. The `value` is JSON to keep the
/// wire format simple — string / number / bool / null cover every case
/// the grid produces. `formula` is set when the user types `=...` so we
/// can preserve it on save.
#[derive(Debug, Deserialize)]
pub struct CellEdit {
    pub row: usize,
    pub col: usize,
    #[serde(default)]
    pub value: serde_json::Value,
    #[serde(default)]
    pub formula: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct WriteCellsArgs {
    pub handle: String,
    pub sheet: String,
    pub edits: Vec<CellEdit>,
}

#[tauri::command]
pub fn workbook_write_cells(
    state: tauri::State<'_, WorkbookState>,
    args: WriteCellsArgs,
) -> Result<()> {
    let mut inner = state.inner.lock();
    let session = inner.get_mut(&args.handle).ok_or_else(|| ArasulError::Internal {
        message: "unknown workbook handle".into(),
    })?;
    let sheet = session
        .sheets
        .iter_mut()
        .find(|s| s.name == args.sheet)
        .ok_or_else(|| ArasulError::Internal {
            message: format!("no sheet '{}'", args.sheet),
        })?;

    for edit in args.edits {
        // Grow the matrix lazily so edits beyond the loaded range create cells.
        while sheet.rows.len() <= edit.row {
            sheet.rows.push(Vec::new());
        }
        let row = &mut sheet.rows[edit.row];
        while row.len() <= edit.col {
            row.push(Cell { value: CellValue::Empty, formula: None });
        }
        let cell = &mut row[edit.col];
        cell.value = json_to_cell_value(&edit.value);
        cell.formula = edit
            .formula
            .filter(|f| !f.is_empty())
            .map(|f| f.trim_start_matches('=').to_string());
        if edit.col + 1 > sheet.max_col {
            sheet.max_col = edit.col + 1;
        }
    }
    Ok(())
}

fn json_to_cell_value(j: &serde_json::Value) -> CellValue {
    match j {
        serde_json::Value::Null => CellValue::Empty,
        serde_json::Value::Bool(b) => CellValue::Bool { v: *b },
        serde_json::Value::Number(n) => n
            .as_f64()
            .map(|v| CellValue::Number { v })
            .unwrap_or(CellValue::Empty),
        serde_json::Value::String(s) => {
            if s.is_empty() {
                CellValue::Empty
            } else {
                CellValue::Text { v: s.clone() }
            }
        }
        // Arrays/objects get string-stringified — should never happen from
        // the grid but lets us handle pathological clipboard paste cases.
        other => CellValue::Text { v: other.to_string() },
    }
}

#[derive(Debug, Deserialize)]
pub struct SaveArgs {
    pub handle: String,
}

#[derive(Debug, Serialize)]
pub struct SaveResult {
    pub path: String,
    pub csv_mirrors: Vec<String>,
}

#[tauri::command]
pub fn workbook_save(
    state: tauri::State<'_, WorkbookState>,
    args: SaveArgs,
) -> Result<SaveResult> {
    let inner = state.inner.lock();
    let session = inner.get(&args.handle).ok_or_else(|| ArasulError::Internal {
        message: "unknown workbook handle".into(),
    })?;

    // Build a fresh xlsx from session state. rust_xlsxwriter is strictly
    // a writer (no in-place edit), so we always rebuild from scratch.
    let mut wb = XWorkbook::new();
    for sheet in &session.sheets {
        let ws = wb
            .add_worksheet()
            .set_name(&sheet.name)
            .map_err(|e| ArasulError::Internal { message: format!("set_name: {e}") })?;
        for (r, row) in sheet.rows.iter().enumerate() {
            for (c, cell) in row.iter().enumerate() {
                write_cell_to_xlsx(ws, r as u32, c as u16, cell)?;
            }
        }
    }

    // Atomic-rename pattern: write to <path>.tmp then rename over original.
    // Per arasul-plan §2.1 exFAT + F_FULLFSYNC for true durability on macOS,
    // but rust_xlsxwriter doesn't expose fsync hooks; rely on save() + rename
    // for now. (The mid-write-unplug case is documented in arasul-plan.)
    let tmp = session.path.with_extension("xlsx.tmp");
    wb.save(&tmp).map_err(|e| ArasulError::Internal {
        message: format!("xlsx save: {e}"),
    })?;
    if session.path.exists() {
        std::fs::remove_file(&session.path).map_err(|e| ArasulError::Internal {
            message: format!("remove old: {e}"),
        })?;
    }
    std::fs::rename(&tmp, &session.path).map_err(|e| ArasulError::Internal {
        message: format!("rename: {e}"),
    })?;

    // CSV mirror per sheet — vision-v3 §3.1 commitment for grep/diff/wiki.
    let csv_mirrors = write_csv_mirrors(session)?;

    Ok(SaveResult {
        path: session.path.to_string_lossy().to_string(),
        csv_mirrors,
    })
}

/// rust_xlsxwriter cell writer. Prefers preserving a formula over a stale
/// cached value; the next time Excel opens the file it'll recalculate.
fn write_cell_to_xlsx(
    ws: &mut rust_xlsxwriter::Worksheet,
    row: u32,
    col: u16,
    cell: &Cell,
) -> Result<()> {
    if let Some(formula) = &cell.formula {
        ws.write_formula(row, col, formula.as_str())
            .map_err(|e| ArasulError::Internal { message: format!("write_formula: {e}") })?;
        return Ok(());
    }
    match &cell.value {
        CellValue::Empty => Ok(()),
        CellValue::Text { v } => {
            ws.write_string(row, col, v)
                .map_err(|e| ArasulError::Internal { message: format!("write_string: {e}") })?;
            Ok(())
        }
        CellValue::Number { v } => {
            ws.write_number(row, col, *v)
                .map_err(|e| ArasulError::Internal { message: format!("write_number: {e}") })?;
            Ok(())
        }
        CellValue::Bool { v } => {
            ws.write_boolean(row, col, *v)
                .map_err(|e| ArasulError::Internal { message: format!("write_boolean: {e}") })?;
            Ok(())
        }
        CellValue::Date { v } => {
            // v1: dates as ISO strings. Real date-typed cells arrive in P2+
            // when we wire chrono / rust_xlsxwriter::ExcelDateTime.
            ws.write_string(row, col, v)
                .map_err(|e| ArasulError::Internal { message: format!("write_string(date): {e}") })?;
            Ok(())
        }
        CellValue::Error { v } => {
            ws.write_string(row, col, &format!("#{v}"))
                .map_err(|e| ArasulError::Internal { message: format!("write_string(err): {e}") })?;
            Ok(())
        }
    }
}

/// Generate a CSV adjacent to the .xlsx for every sheet:
///   <basename>.<sheetname>.csv  for multi-sheet files
///   <basename>.csv              when there's only one sheet
/// Existing files are atomically replaced. Sheet-name slug-cleaned so
/// "Sheet 1!" lands as "sheet-1".
fn write_csv_mirrors(session: &WorkbookSession) -> Result<Vec<String>> {
    let parent = session.path.parent().unwrap_or(std::path::Path::new("."));
    let stem = session
        .path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "workbook".into());
    let single_sheet = session.sheets.len() == 1;
    let mut written = Vec::with_capacity(session.sheets.len());

    for sheet in &session.sheets {
        let csv_path = if single_sheet {
            parent.join(format!("{stem}.csv"))
        } else {
            parent.join(format!("{stem}.{}.csv", sheet_slug(&sheet.name)))
        };
        let mut buf = String::new();
        for row in &sheet.rows {
            for (i, cell) in row.iter().enumerate() {
                if i > 0 { buf.push(','); }
                buf.push_str(&csv_escape(cell));
            }
            buf.push('\n');
        }
        let tmp = csv_path.with_extension("csv.tmp");
        std::fs::write(&tmp, buf).map_err(|e| ArasulError::Internal {
            message: format!("csv write: {e}"),
        })?;
        if csv_path.exists() {
            std::fs::remove_file(&csv_path).map_err(|e| ArasulError::Internal {
                message: format!("csv remove old: {e}"),
            })?;
        }
        std::fs::rename(&tmp, &csv_path).map_err(|e| ArasulError::Internal {
            message: format!("csv rename: {e}"),
        })?;
        written.push(csv_path.to_string_lossy().to_string());
    }
    Ok(written)
}

fn sheet_slug(name: &str) -> String {
    let s: String = name
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c.to_ascii_lowercase() } else { '-' })
        .collect();
    s.split('-').filter(|p| !p.is_empty()).collect::<Vec<_>>().join("-")
}

/// CSV-escape a cell. Uses the formula text when present (so the CSV
/// reflects what the user typed, not the cached evaluation result).
fn csv_escape(cell: &Cell) -> String {
    let raw = if let Some(f) = &cell.formula {
        format!("={f}")
    } else {
        match &cell.value {
            CellValue::Empty => String::new(),
            CellValue::Text { v } => v.clone(),
            CellValue::Number { v } => {
                if v.fract() == 0.0 && v.abs() < 1e16 {
                    format!("{}", *v as i64)
                } else {
                    format!("{v}")
                }
            }
            CellValue::Bool { v } => (if *v { "TRUE" } else { "FALSE" }).into(),
            CellValue::Date { v } => v.clone(),
            CellValue::Error { v } => format!("#{v}"),
        }
    };
    if raw.contains(',') || raw.contains('"') || raw.contains('\n') || raw.contains('\r') {
        format!("\"{}\"", raw.replace('"', "\"\""))
    } else {
        raw
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rust_xlsxwriter::Workbook as XWorkbook;
    use tempfile::tempdir;

    fn write_fixture(path: &std::path::Path) {
        let mut wb = XWorkbook::new();
        let sheet = wb.add_worksheet().set_name("Data").unwrap();
        sheet.write_string(0, 0, "Name").unwrap();
        sheet.write_string(0, 1, "Age").unwrap();
        sheet.write_string(1, 0, "Kolja").unwrap();
        sheet.write_number(1, 1, 31.0).unwrap();
        sheet.write_string(2, 0, "Ada").unwrap();
        sheet.write_number(2, 1, 42.0).unwrap();
        let meta = wb.add_worksheet().set_name("Meta").unwrap();
        meta.write_string(0, 0, "k").unwrap();
        meta.write_string(0, 1, "v").unwrap();
        wb.save(path).unwrap();
    }

    #[test]
    fn round_trip_edit_save_reopen() {
        let dir = tempdir().unwrap();
        let p = dir.path().join("rt.xlsx");
        write_fixture(&p);

        // Open → read state directly via the helper logic.
        let mut wb = open_workbook_auto(&p).unwrap();
        let names = wb.sheet_names().to_vec();
        let mut sheets: Vec<Sheet> = Vec::new();
        for name in &names {
            let range = wb.worksheet_range(name).unwrap();
            let mut rows: Vec<Vec<Cell>> = Vec::new();
            let mut max_col = 0usize;
            for row in range.rows() {
                let mapped: Vec<Cell> = row.iter().map(|d| Cell {
                    value: CellValue::from_calamine(d),
                    formula: None,
                }).collect();
                max_col = max_col.max(mapped.len());
                rows.push(mapped);
            }
            sheets.push(Sheet { name: name.clone(), rows, max_col });
        }
        let mut session = WorkbookSession { path: p.clone(), sheets };

        // Edit the "Data" sheet: set Age of Kolja (row 1, col 1) to 33.
        let data_sheet = session.sheets.iter_mut().find(|s| s.name == "Data").unwrap();
        data_sheet.rows[1][1] = Cell {
            value: CellValue::Number { v: 33.0 },
            formula: None,
        };
        // Add a brand-new cell at row 3, col 0 ("Lin").
        while data_sheet.rows.len() <= 3 { data_sheet.rows.push(Vec::new()); }
        let row3 = &mut data_sheet.rows[3];
        while row3.len() <= 0 { row3.push(Cell { value: CellValue::Empty, formula: None }); }
        row3[0] = Cell { value: CellValue::Text { v: "Lin".into() }, formula: None };
        if data_sheet.max_col < 1 { data_sheet.max_col = 1; }

        // Save via the helper inline (workbook_save bypassed for unit testing).
        let mut xwb = XWorkbook::new();
        for sheet in &session.sheets {
            let ws = xwb.add_worksheet().set_name(&sheet.name).unwrap();
            for (r, row) in sheet.rows.iter().enumerate() {
                for (c, cell) in row.iter().enumerate() {
                    write_cell_to_xlsx(ws, r as u32, c as u16, cell).unwrap();
                }
            }
        }
        xwb.save(&p).unwrap();

        // Reopen and verify edits stuck.
        let mut wb2 = open_workbook_auto(&p).unwrap();
        let range = wb2.worksheet_range("Data").unwrap();
        let rows: Vec<Vec<&Data>> = range.rows().map(|r| r.iter().collect()).collect();
        // Row 1 col 1 should now be 33.
        let val = match rows[1][1] {
            Data::Float(v) => *v,
            Data::Int(v) => *v as f64,
            other => panic!("expected number at [1][1], got {other:?}"),
        };
        assert!((val - 33.0).abs() < 1e-9, "expected 33.0, got {val}");
        // Row 3 col 0 should be "Lin".
        match rows[3][0] {
            Data::String(s) => assert_eq!(s, "Lin"),
            other => panic!("expected text at [3][0], got {other:?}"),
        }
        // Row 2 (Ada) should still be intact.
        match rows[2][0] {
            Data::String(s) => assert_eq!(s, "Ada"),
            other => panic!("expected text at [2][0], got {other:?}"),
        }

        // CSV-mirror generation (separate helper call — we don't exercise
        // workbook_save here because it requires a tauri::State).
        let mirrors = write_csv_mirrors(&session).unwrap();
        // Multi-sheet → one CSV per sheet.
        assert_eq!(mirrors.len(), 2);
        let data_csv_path = dir.path().join("rt.data.csv");
        assert!(data_csv_path.exists(), "expected csv-mirror at {}", data_csv_path.display());
        let csv_text = std::fs::read_to_string(&data_csv_path).unwrap();
        assert!(csv_text.contains("Kolja,33"), "csv content: {csv_text}");
        assert!(csv_text.contains("Lin"), "csv content: {csv_text}");
    }

    #[test]
    fn open_and_read_sheet() {
        let dir = tempdir().unwrap();
        let p = dir.path().join("fixture.xlsx");
        write_fixture(&p);

        let state = WorkbookState::new();
        // We can't easily build a tauri::State in unit tests, so we exercise
        // the inner logic by replicating what the command does.
        let mut wb = open_workbook_auto(&p).unwrap();
        let names = wb.sheet_names().to_vec();
        assert_eq!(names, vec!["Data".to_string(), "Meta".to_string()]);

        let mut session_sheets: Vec<Sheet> = Vec::new();
        for name in &names {
            let range = wb.worksheet_range(name).unwrap();
            let mut rows: Vec<Vec<Cell>> = Vec::new();
            let mut max_col = 0usize;
            for row in range.rows() {
                let mapped: Vec<Cell> = row
                    .iter()
                    .map(|d| Cell {
                        value: CellValue::from_calamine(d),
                        formula: None,
                    })
                    .collect();
                max_col = max_col.max(mapped.len());
                rows.push(mapped);
            }
            session_sheets.push(Sheet { name: name.clone(), rows, max_col });
        }

        let handle = Uuid::new_v4().to_string();
        state.inner.lock().insert(
            handle.clone(),
            WorkbookSession { path: p.clone(), sheets: session_sheets },
        );

        let grid = {
            let inner = state.inner.lock();
            let s = inner.get(&handle).unwrap();
            let sh = s.sheets.iter().find(|x| x.name == "Data").unwrap();
            CellGrid {
                rows: sh
                    .rows
                    .iter()
                    .map(|r| {
                        r.iter()
                            .map(|c| JsonCell {
                                value: c.value.clone(),
                                formula: c.formula.clone(),
                            })
                            .collect()
                    })
                    .collect(),
                max_col: sh.max_col,
                max_row: sh.rows.len(),
            }
        };

        assert_eq!(grid.max_row, 3);
        assert_eq!(grid.max_col, 2);
        match &grid.rows[1][1].value {
            CellValue::Number { v } => assert_eq!(*v, 31.0),
            other => panic!("expected number, got {other:?}"),
        }
        match &grid.rows[2][0].value {
            CellValue::Text { v } => assert_eq!(v, "Ada"),
            other => panic!("expected text, got {other:?}"),
        }
    }
}
