#!/usr/bin/env node
/* Phase 11.7 (2026-05-11) — CSS design-token linter.
 *
 * Custom rule for the arasul-app CSS: flag raw color literals (hex, rgb,
 * rgba, hsl, hsla) that aren't either:
 *   1. defined in theme.css (where the design tokens live), or
 *   2. used as the fallback in `var(--token, <literal>)`.
 *
 * The motivation came from the 17-agent audit (agent-13 design tokens):
 * Tailwind v4's @theme block is the single source of truth, and ad-hoc
 * colors in component CSS drift from the design system. This script is
 * cheap, requires no Node deps, and runs in CI via `pnpm css:check`.
 *
 * Modes:
 *   default — warn mode: prints violations but exits 0 (visible in PR diff
 *             but non-blocking; lets us tighten over time).
 *   --strict — fails (exit 1) on any violation. Wired into CI once the
 *              current violations have been refactored out.
 *
 * Exemption: place `/* css-tokens-allow *\/` on the same line as a color
 * literal to opt out for that one declaration. Keeps the audit trail in
 * the diff — reviewers can see and challenge each waiver.
 *
 * Exit codes: 0 = clean (or warn-mode w/ violations), 1 = strict + violations,
 *             2 = scan error.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");
const cssRoot = resolve(repoRoot, "arasul-app/src");
const strict = process.argv.includes("--strict");
const allowMarker = "css-tokens-allow";
// Files exempt from the rule — they *are* the token definitions, or
// they intentionally hardcode a third-party widget's color palette (the
// glide-data-grid theme is configured via JS literals, mirrored as CSS
// fallbacks in ProviderPicker for non-themed badges).
const exemptFiles = new Set([
  "theme.css",
]);

// Patterns we care about — single line scan, no AST needed.
const HEX = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
const RGB = /\brgba?\s*\(/g;
const HSL = /\bhsla?\s*\(/g;

// A color literal is a "fallback" when it sits inside the second argument
// of var(--token, …). We don't try to balance parens perfectly — instead,
// we strip out every var(...) call before scanning. That's correct for our
// CSS (no nested vars currently) and cheap.
function stripVarFallbacks(line) {
  // Greedy enough to consume "var(--x, rgba(…))" because we then re-scan
  // and any remaining literal must have been outside a var() call.
  return line.replace(/var\([^)]*\)/g, "");
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (name.endsWith(".css")) out.push(full);
  }
  return out;
}

let violations = 0;

try {
  const files = walk(cssRoot);
  for (const file of files) {
    const rel = relative(cssRoot, file).replaceAll("\\", "/");
    if (exemptFiles.has(rel)) continue; // tokens live here

    const src = readFileSync(file, "utf8");
    const lines = src.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      // Per-line exemption marker — overrides everything on the line.
      if (raw.includes(allowMarker)) continue;
      // Strip /* … */ on this line — we don't want comment colors flagged.
      const noComments = raw.replace(/\/\*.*?\*\//g, "");
      const stripped = stripVarFallbacks(noComments);
      const findings = [];
      for (const m of stripped.matchAll(HEX)) findings.push(`hex literal "${m[0]}"`);
      for (const m of stripped.matchAll(RGB)) findings.push(`rgb()/rgba() literal "${m[0]}…"`);
      for (const m of stripped.matchAll(HSL)) findings.push(`hsl()/hsla() literal "${m[0]}…"`);
      if (findings.length === 0) continue;
      for (const f of findings) {
        violations++;
        const display = relative(repoRoot, file);
        console.error(`${display}:${i + 1}: ${f} — use a design token from theme.css instead.`);
      }
    }
  }
} catch (err) {
  console.error("check-css-tokens: scan failed:", err);
  process.exit(2);
}

if (violations === 0) {
  console.log("check-css-tokens: 0 violations across", cssRoot);
  process.exit(0);
}
const verb = strict ? "FAIL" : "warn";
console.error(
  `\ncheck-css-tokens [${verb}]: ${violations} violation(s) — fix above, ` +
  `move the literal into theme.css, or add /* ${allowMarker} */ to the line.`,
);
process.exit(strict ? 1 : 0);
