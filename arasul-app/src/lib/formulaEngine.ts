/**
 * Mini formula engine for the spreadsheet axis (vision-v3 §3.1, locked
 * 2026-04-26). MIT-clean, no external deps. Covers the 15 Excel functions
 * that show up in 90% of personal/research workflows.
 *
 * Scope (v1):
 *   - Arithmetic: + - * / and unary minus
 *   - Comparisons: = <> < <= > >=    (return TRUE/FALSE)
 *   - Concat: &
 *   - Cell refs: A1, $A$1, AB12  — case-insensitive column letters
 *   - Ranges: A1:B5 (rectangular)
 *   - Numeric, string, boolean literals (TRUE/FALSE keywords)
 *   - Quoted string literals: "hello"
 *   - Functions: SUM, AVG, AVERAGE, COUNT, MIN, MAX, IF, ROUND, ABS,
 *     CONCAT, CONCATENATE, LEN, UPPER, LOWER, TRIM, NOW
 *
 * Out of scope (v1.1+):
 *   - Cross-sheet refs (Sheet2!A1)
 *   - Named ranges
 *   - Array formulas / spill ranges
 *   - Date arithmetic beyond NOW
 *   - Recursive-deps tracking — caller recomputes the whole sheet on any
 *     change. Fine for personal-scale sheets (<5000 formulas).
 *
 * Errors propagate as `Result.error("#NAME?")` / `#DIV/0!` / `#VALUE!` /
 * `#REF!` matching Excel conventions.
 */

export type FormulaCellValue =
  | { kind: "empty" }
  | { kind: "text"; v: string }
  | { kind: "number"; v: number }
  | { kind: "bool"; v: boolean }
  | { kind: "date"; v: string }
  | { kind: "error"; v: string };

export type EvalContext = {
  /** Returns the current value at row,col (zero-based). Empty cells return `{ kind: "empty" }`. */
  getCell(row: number, col: number): FormulaCellValue;
};

export type Result =
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "bool"; value: boolean }
  | { kind: "error"; value: string };

export function evaluate(formula: string, ctx: EvalContext): Result {
  try {
    const tokens = tokenize(formula);
    const parser = new Parser(tokens);
    const ast = parser.parseExpression(0);
    if (parser.peek().kind !== "EOF") {
      return { kind: "error", value: "#PARSE!" };
    }
    return evalNode(ast, ctx, 0);
  } catch (e) {
    if (e && typeof e === "object" && "errorCode" in (e as object)) {
      return { kind: "error", value: (e as { errorCode: string }).errorCode };
    }
    return { kind: "error", value: "#PARSE!" };
  }
}

/** Format a Result for grid display. Errors keep their `#FOO!` form. */
export function resultToDisplay(r: Result): string {
  switch (r.kind) {
    case "number":
      if (!Number.isFinite(r.value)) return "#NUM!";
      if (Number.isInteger(r.value)) return String(r.value);
      return r.value.toLocaleString(undefined, { maximumFractionDigits: 8 });
    case "string": return r.value;
    case "bool":   return r.value ? "TRUE" : "FALSE";
    case "error":  return r.value;
  }
}

// ---------------- Tokenizer ----------------

type Token =
  | { kind: "NUMBER"; value: number }
  | { kind: "STRING"; value: string }
  | { kind: "IDENT"; value: string }
  | { kind: "BOOL"; value: boolean }
  | { kind: "LPAREN" }
  | { kind: "RPAREN" }
  | { kind: "COMMA" }
  | { kind: "COLON" }
  | { kind: "PLUS" }
  | { kind: "MINUS" }
  | { kind: "STAR" }
  | { kind: "SLASH" }
  | { kind: "AMP" }
  | { kind: "EQ" }
  | { kind: "NEQ" }
  | { kind: "LT" }
  | { kind: "LE" }
  | { kind: "GT" }
  | { kind: "GE" }
  | { kind: "EOF" };

class ParseError extends Error {
  errorCode: string;
  constructor(code: string) { super(code); this.errorCode = code; }
}

function tokenize(input: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const n = input.length;
  while (i < n) {
    const c = input[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") { i++; continue; }
    if (c === "(") { out.push({ kind: "LPAREN" }); i++; continue; }
    if (c === ")") { out.push({ kind: "RPAREN" }); i++; continue; }
    if (c === ",") { out.push({ kind: "COMMA" }); i++; continue; }
    if (c === ":") { out.push({ kind: "COLON" }); i++; continue; }
    if (c === "+") { out.push({ kind: "PLUS" }); i++; continue; }
    if (c === "-") { out.push({ kind: "MINUS" }); i++; continue; }
    if (c === "*") { out.push({ kind: "STAR" }); i++; continue; }
    if (c === "/") { out.push({ kind: "SLASH" }); i++; continue; }
    if (c === "&") { out.push({ kind: "AMP" }); i++; continue; }
    if (c === "=") { out.push({ kind: "EQ" }); i++; continue; }
    if (c === "<") {
      if (input[i + 1] === "=") { out.push({ kind: "LE" }); i += 2; continue; }
      if (input[i + 1] === ">") { out.push({ kind: "NEQ" }); i += 2; continue; }
      out.push({ kind: "LT" }); i++; continue;
    }
    if (c === ">") {
      if (input[i + 1] === "=") { out.push({ kind: "GE" }); i += 2; continue; }
      out.push({ kind: "GT" }); i++; continue;
    }
    if (c === '"') {
      i++;
      let s = "";
      while (i < n && input[i] !== '"') {
        if (input[i] === "\\" && i + 1 < n) { s += input[i + 1]; i += 2; continue; }
        s += input[i]; i++;
      }
      if (i >= n) throw new ParseError("#PARSE!");
      i++; // consume closing quote
      out.push({ kind: "STRING", value: s });
      continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(input[i + 1] ?? ""))) {
      let j = i;
      while (j < n && /[0-9.]/.test(input[j])) j++;
      const num = parseFloat(input.slice(i, j));
      if (Number.isNaN(num)) throw new ParseError("#PARSE!");
      out.push({ kind: "NUMBER", value: num });
      i = j;
      continue;
    }
    // Identifier (function name, cell ref, named keyword). Leading `$` for
    // absolute refs is part of the identifier so the parser sees `$A$1`
    // as one token.
    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_$]/.test(input[j])) j++;
      const word = input.slice(i, j);
      const upper = word.toUpperCase();
      if (upper === "TRUE")  { out.push({ kind: "BOOL", value: true }); }
      else if (upper === "FALSE") { out.push({ kind: "BOOL", value: false }); }
      else { out.push({ kind: "IDENT", value: word }); }
      i = j;
      continue;
    }
    throw new ParseError("#PARSE!");
  }
  out.push({ kind: "EOF" });
  return out;
}

// ---------------- AST + parser (Pratt) ----------------

type Node =
  | { type: "num"; value: number }
  | { type: "str"; value: string }
  | { type: "bool"; value: boolean }
  | { type: "ref"; row: number; col: number }
  | { type: "range"; r0: number; c0: number; r1: number; c1: number }
  | { type: "neg"; arg: Node }
  | { type: "bin"; op: string; left: Node; right: Node }
  | { type: "fn"; name: string; args: Node[] };

const PREC = {
  COMPARE: 1,
  CONCAT: 2,
  ADD: 3,
  MUL: 4,
  RANGE: 6,
} as const;

class Parser {
  private i = 0;
  constructor(private tokens: Token[]) {}

  peek(off = 0): Token { return this.tokens[this.i + off]; }
  consume(): Token { return this.tokens[this.i++]; }

  parseExpression(minPrec: number): Node {
    let left = this.parsePrefix();
    while (true) {
      const t = this.peek();
      const op = infixOp(t);
      if (!op || op.prec < minPrec) break;
      this.consume();
      const right = this.parseExpression(op.prec + 1);
      left = { type: "bin", op: op.symbol, left, right };
    }
    return left;
  }

  parsePrefix(): Node {
    const t = this.consume();
    switch (t.kind) {
      case "NUMBER": return { type: "num", value: t.value };
      case "STRING": return { type: "str", value: t.value };
      case "BOOL":   return { type: "bool", value: t.value };
      case "MINUS":  return { type: "neg", arg: this.parseExpression(PREC.MUL + 1) };
      case "PLUS":   return this.parseExpression(PREC.MUL + 1); // unary plus is no-op
      case "LPAREN": {
        const inner = this.parseExpression(0);
        if (this.consume().kind !== "RPAREN") throw new ParseError("#PARSE!");
        return inner;
      }
      case "IDENT": {
        // Function call?
        if (this.peek().kind === "LPAREN") {
          this.consume(); // (
          const args: Node[] = [];
          if (this.peek().kind !== "RPAREN") {
            args.push(this.parseExpression(0));
            while (this.peek().kind === "COMMA") {
              this.consume();
              args.push(this.parseExpression(0));
            }
          }
          if (this.consume().kind !== "RPAREN") throw new ParseError("#PARSE!");
          return { type: "fn", name: t.value.toUpperCase(), args };
        }
        // Cell ref or range?
        const ref = parseCellRef(t.value);
        if (!ref) throw new ParseError("#NAME?");
        if (this.peek().kind === "COLON") {
          this.consume();
          const next = this.consume();
          if (next.kind !== "IDENT") throw new ParseError("#REF!");
          const r2 = parseCellRef(next.value);
          if (!r2) throw new ParseError("#REF!");
          const r0 = Math.min(ref.row, r2.row);
          const r1 = Math.max(ref.row, r2.row);
          const c0 = Math.min(ref.col, r2.col);
          const c1 = Math.max(ref.col, r2.col);
          return { type: "range", r0, c0, r1, c1 };
        }
        return { type: "ref", row: ref.row, col: ref.col };
      }
      default:
        throw new ParseError("#PARSE!");
    }
  }
}

function infixOp(t: Token): { symbol: string; prec: number } | null {
  switch (t.kind) {
    case "PLUS":  return { symbol: "+", prec: PREC.ADD };
    case "MINUS": return { symbol: "-", prec: PREC.ADD };
    case "STAR":  return { symbol: "*", prec: PREC.MUL };
    case "SLASH": return { symbol: "/", prec: PREC.MUL };
    case "AMP":   return { symbol: "&", prec: PREC.CONCAT };
    case "EQ":    return { symbol: "=",  prec: PREC.COMPARE };
    case "NEQ":   return { symbol: "<>", prec: PREC.COMPARE };
    case "LT":    return { symbol: "<",  prec: PREC.COMPARE };
    case "LE":    return { symbol: "<=", prec: PREC.COMPARE };
    case "GT":    return { symbol: ">",  prec: PREC.COMPARE };
    case "GE":    return { symbol: ">=", prec: PREC.COMPARE };
    default:      return null;
  }
}

function parseCellRef(s: string): { row: number; col: number } | null {
  const m = /^\$?([A-Za-z]+)\$?(\d+)$/.exec(s);
  if (!m) return null;
  const col = colLettersToIndex(m[1]);
  const row = parseInt(m[2], 10) - 1;
  if (row < 0 || col < 0) return null;
  return { row, col };
}

function colLettersToIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}

// ---------------- Evaluator ----------------

const MAX_RECURSION = 64;

function evalNode(n: Node, ctx: EvalContext, depth: number): Result {
  if (depth > MAX_RECURSION) return { kind: "error", value: "#CYCLE!" };
  switch (n.type) {
    case "num":   return { kind: "number", value: n.value };
    case "str":   return { kind: "string", value: n.value };
    case "bool":  return { kind: "bool", value: n.value };
    case "neg": {
      const r = evalNode(n.arg, ctx, depth + 1);
      if (r.kind === "error") return r;
      const num = coerceNumber(r);
      if (num.kind === "error") return num;
      return { kind: "number", value: -num.value };
    }
    case "ref":   return cellResult(ctx.getCell(n.row, n.col));
    case "range": return { kind: "error", value: "#VALUE!" };  // bare range outside fn
    case "bin": {
      const l = evalNode(n.left, ctx, depth + 1);
      if (l.kind === "error") return l;
      const r = evalNode(n.right, ctx, depth + 1);
      if (r.kind === "error") return r;
      return applyBinOp(n.op, l, r);
    }
    case "fn":    return callFunction(n.name, n.args, ctx, depth);
  }
}

function cellResult(c: FormulaCellValue): Result {
  switch (c.kind) {
    case "empty":  return { kind: "number", value: 0 };  // empty acts as 0/""
    case "text":   return { kind: "string", value: c.v };
    case "number": return { kind: "number", value: c.v };
    case "bool":   return { kind: "bool", value: c.v };
    case "date":   return { kind: "string", value: c.v };
    case "error":  return { kind: "error", value: c.v.startsWith("#") ? c.v : `#${c.v}` };
  }
}

function coerceNumber(r: Result): Result {
  if (r.kind === "number") return r;
  if (r.kind === "bool")   return { kind: "number", value: r.value ? 1 : 0 };
  if (r.kind === "error")  return r;
  if (r.kind === "string") {
    if (r.value === "") return { kind: "number", value: 0 };
    const n = Number(r.value);
    if (Number.isFinite(n)) return { kind: "number", value: n };
    return { kind: "error", value: "#VALUE!" };
  }
  return { kind: "error", value: "#VALUE!" };
}

function coerceString(r: Result): string {
  switch (r.kind) {
    case "number": return Number.isInteger(r.value) ? String(r.value) : String(r.value);
    case "string": return r.value;
    case "bool":   return r.value ? "TRUE" : "FALSE";
    case "error":  return r.value;
  }
}

function applyBinOp(op: string, l: Result, r: Result): Result {
  if (op === "&") {
    return { kind: "string", value: coerceString(l) + coerceString(r) };
  }
  if (op === "+" || op === "-" || op === "*" || op === "/") {
    const ln = coerceNumber(l); if (ln.kind === "error") return ln;
    const rn = coerceNumber(r); if (rn.kind === "error") return rn;
    const a = (ln as { value: number }).value;
    const b = (rn as { value: number }).value;
    if (op === "+") return { kind: "number", value: a + b };
    if (op === "-") return { kind: "number", value: a - b };
    if (op === "*") return { kind: "number", value: a * b };
    if (op === "/") {
      if (b === 0) return { kind: "error", value: "#DIV/0!" };
      return { kind: "number", value: a / b };
    }
  }
  // Comparison: compare same kinds; numbers compare numerically; strings
  // case-insensitive (Excel convention); booleans compare as numbers.
  if (op === "=" || op === "<>" || op === "<" || op === "<=" || op === ">" || op === ">=") {
    const cmp = compareForCompare(l, r);
    let out: boolean;
    switch (op) {
      case "=":  out = cmp === 0; break;
      case "<>": out = cmp !== 0; break;
      case "<":  out = cmp < 0;   break;
      case "<=": out = cmp <= 0;  break;
      case ">":  out = cmp > 0;   break;
      case ">=": out = cmp >= 0;  break;
      default: out = false;
    }
    return { kind: "bool", value: out };
  }
  return { kind: "error", value: "#PARSE!" };
}

function compareForCompare(l: Result, r: Result): number {
  if (l.kind === "error") return -1;
  if (r.kind === "error") return 1;
  // If both are coercible to number (or one is bool), compare numerically.
  const ln = coerceNumber(l);
  const rn = coerceNumber(r);
  if (ln.kind === "number" && rn.kind === "number") {
    return ln.value === rn.value ? 0 : (ln.value < rn.value ? -1 : 1);
  }
  // Fall back to case-insensitive string compare.
  const a = coerceString(l).toLowerCase();
  const b = coerceString(r).toLowerCase();
  return a === b ? 0 : (a < b ? -1 : 1);
}

// ---------------- Function library ----------------

function callFunction(name: string, args: Node[], ctx: EvalContext, depth: number): Result {
  // Helper: collect all numeric values from args. Ranges expand to flat
  // lists. Strings are skipped (Excel SUM() ignores text).
  const collectNumbers = (): { vals: number[]; err?: Result } => {
    const out: number[] = [];
    for (const a of args) {
      const flat = flatten(a, ctx, depth + 1);
      if ("err" in flat && flat.err) return { vals: [], err: flat.err };
      for (const v of flat.values) {
        if (v.kind === "number") out.push(v.value);
        else if (v.kind === "bool") out.push(v.value ? 1 : 0);
        // empty / text / date silently skipped
      }
    }
    return { vals: out };
  };

  switch (name) {
    case "SUM": {
      const { vals, err } = collectNumbers();
      if (err) return err;
      return { kind: "number", value: vals.reduce((a, b) => a + b, 0) };
    }
    case "AVG":
    case "AVERAGE": {
      const { vals, err } = collectNumbers();
      if (err) return err;
      if (vals.length === 0) return { kind: "error", value: "#DIV/0!" };
      return { kind: "number", value: vals.reduce((a, b) => a + b, 0) / vals.length };
    }
    case "COUNT": {
      const { vals, err } = collectNumbers();
      if (err) return err;
      return { kind: "number", value: vals.length };
    }
    case "MIN": {
      const { vals, err } = collectNumbers();
      if (err) return err;
      if (vals.length === 0) return { kind: "number", value: 0 };
      return { kind: "number", value: Math.min(...vals) };
    }
    case "MAX": {
      const { vals, err } = collectNumbers();
      if (err) return err;
      if (vals.length === 0) return { kind: "number", value: 0 };
      return { kind: "number", value: Math.max(...vals) };
    }
    case "IF": {
      if (args.length < 2 || args.length > 3) return { kind: "error", value: "#N/A" };
      const cond = evalNode(args[0], ctx, depth + 1);
      if (cond.kind === "error") return cond;
      const truthy = cond.kind === "bool" ? cond.value
                  : cond.kind === "number" ? cond.value !== 0
                  : cond.kind === "string" ? cond.value !== ""
                  : false;
      return truthy
        ? evalNode(args[1], ctx, depth + 1)
        : (args[2] ? evalNode(args[2], ctx, depth + 1) : { kind: "bool", value: false });
    }
    case "ROUND": {
      if (args.length < 1 || args.length > 2) return { kind: "error", value: "#N/A" };
      const num = evalNode(args[0], ctx, depth + 1);
      const numC = coerceNumber(num); if (numC.kind === "error") return numC;
      let dec = 0;
      if (args[1]) {
        const d = evalNode(args[1], ctx, depth + 1);
        const dC = coerceNumber(d); if (dC.kind === "error") return dC;
        dec = Math.trunc((dC as { value: number }).value);
      }
      const factor = Math.pow(10, dec);
      return { kind: "number", value: Math.round((numC as { value: number }).value * factor) / factor };
    }
    case "ABS": {
      if (args.length !== 1) return { kind: "error", value: "#N/A" };
      const r = evalNode(args[0], ctx, depth + 1);
      const n = coerceNumber(r); if (n.kind === "error") return n;
      return { kind: "number", value: Math.abs((n as { value: number }).value) };
    }
    case "CONCAT":
    case "CONCATENATE": {
      let out = "";
      for (const a of args) {
        const flat = flatten(a, ctx, depth + 1);
        if ("err" in flat && flat.err) return flat.err;
        for (const v of flat.values) out += coerceString(v);
      }
      return { kind: "string", value: out };
    }
    case "LEN": {
      if (args.length !== 1) return { kind: "error", value: "#N/A" };
      const r = evalNode(args[0], ctx, depth + 1);
      if (r.kind === "error") return r;
      return { kind: "number", value: coerceString(r).length };
    }
    case "UPPER": {
      if (args.length !== 1) return { kind: "error", value: "#N/A" };
      const r = evalNode(args[0], ctx, depth + 1);
      if (r.kind === "error") return r;
      return { kind: "string", value: coerceString(r).toUpperCase() };
    }
    case "LOWER": {
      if (args.length !== 1) return { kind: "error", value: "#N/A" };
      const r = evalNode(args[0], ctx, depth + 1);
      if (r.kind === "error") return r;
      return { kind: "string", value: coerceString(r).toLowerCase() };
    }
    case "TRIM": {
      if (args.length !== 1) return { kind: "error", value: "#N/A" };
      const r = evalNode(args[0], ctx, depth + 1);
      if (r.kind === "error") return r;
      // Excel TRIM: leading/trailing whitespace + collapse multiple spaces.
      return { kind: "string", value: coerceString(r).trim().replace(/\s+/g, " ") };
    }
    case "NOW": {
      if (args.length !== 0) return { kind: "error", value: "#N/A" };
      return { kind: "string", value: new Date().toISOString().slice(0, 19).replace("T", " ") };
    }
    default:
      return { kind: "error", value: "#NAME?" };
  }
}

/** Flatten a Node argument into a list of Results (cells from a range,
 * or one Result for any other expression). */
function flatten(n: Node, ctx: EvalContext, depth: number): { values: Result[]; err?: Result } {
  if (n.type === "range") {
    const out: Result[] = [];
    for (let r = n.r0; r <= n.r1; r++) {
      for (let c = n.c0; c <= n.c1; c++) {
        const res = cellResult(ctx.getCell(r, c));
        if (res.kind === "error") return { values: [], err: res };
        out.push(res);
      }
    }
    return { values: out };
  }
  const v = evalNode(n, ctx, depth);
  if (v.kind === "error") return { values: [], err: v };
  return { values: [v] };
}
