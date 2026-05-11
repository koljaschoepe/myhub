#!/usr/bin/env node
/**
 * check-bundle-size.mjs — Phase 11.6 (2026-05-11)
 *
 * Lightweight bundle-budget guard. Reads the production build output
 * in `arasul-app/dist/assets/` and fails the script if the main JS
 * chunk's gzipped size exceeds the budget.
 *
 * The default budget is generous (1750KB gzip) and intentional: the
 * stack (Tiptap + CodeMirror + xterm + glide-data-grid + Radix) is
 * heavy and the user runs the app from a USB-SSD, not over the wire —
 * cold-load weight isn't the limiting factor. The point of the budget
 * is to catch a single rogue dep blowing the chunk size by a megabyte.
 *
 * Usage:
 *   pnpm vite build && pnpm bundle:check
 *
 * Adjust the budget by setting BUNDLE_BUDGET_KB=2000 in the env, or by
 * editing the constant below. When changing, also bump the audit
 * baseline in docs/plans/2026-05-11-frontend-ux-overhaul.md.
 */

import { readdir, stat, readFile } from "node:fs/promises";
import { gzip } from "node:zlib";
import { promisify } from "node:util";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, "..", "arasul-app", "dist", "assets");

const BUDGET_KB = Number(process.env.BUNDLE_BUDGET_KB) || 1750;

const gzipAsync = promisify(gzip);

async function main() {
  let entries;
  try {
    entries = await readdir(DIST);
  } catch (e) {
    console.error(`bundle-check: couldn't read ${DIST}. Run \`pnpm vite build\` first.`);
    console.error(`  ${e.message}`);
    process.exit(2);
  }

  // The main app chunk is the largest `index-*.js` file. Vite's output
  // names are content-hashed so we sort by size to find it.
  const jsFiles = entries.filter((f) => f.startsWith("index-") && f.endsWith(".js"));
  if (jsFiles.length === 0) {
    console.error("bundle-check: no index-*.js files in dist/assets.");
    process.exit(2);
  }

  let mainFile = jsFiles[0];
  let mainSize = 0;
  for (const f of jsFiles) {
    const s = await stat(join(DIST, f));
    if (s.size > mainSize) {
      mainSize = s.size;
      mainFile = f;
    }
  }

  const buf = await readFile(join(DIST, mainFile));
  const gz = await gzipAsync(buf);
  const gzKb = gz.length / 1024;
  const rawKb = buf.length / 1024;

  const status = gzKb <= BUDGET_KB ? "OK" : "FAIL";
  console.log(`bundle-check: ${mainFile}`);
  console.log(`  raw  : ${rawKb.toFixed(1)} KB`);
  console.log(`  gzip : ${gzKb.toFixed(1)} KB  (budget ${BUDGET_KB} KB)`);
  console.log(`  ${status}`);

  if (status === "FAIL") {
    console.error(
      `bundle-check: gzip size exceeded by ${(gzKb - BUDGET_KB).toFixed(1)} KB. ` +
      `Either trim deps or bump BUNDLE_BUDGET_KB intentionally.`,
    );
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("bundle-check: unexpected error:", e);
  process.exit(2);
});
