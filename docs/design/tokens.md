---
name: design-tokens
status: locked
last_touched: 2026-05-11
related: [arasul-design-spec, frontend-ux-overhaul]
---

# Arasul Design Tokens

Source of truth: `arasul-app/src/theme.css`. This document is a human-readable index. When in doubt, the CSS file wins.

Established 2026-04-24 (legacy 1A Linear-clean palette). Extended 2026-05-11 (Phase 1.3 — 2026 token scales + Tailwind v4 `@theme` block + Radix primitives adoption).

---

## Quick reference

| Aspect | Newest API | Legacy alias (still works) |
|---|---|---|
| Spacing | `--space-3` (8px) | `--sp-2` |
| Type    | `--text-body` (13px) | `--fs-body` |
| Surface | `--bg-surface` | `--bg-pane` |
| Border  | `--border-default` | `--border-subtle` |
| Muted text | `--text-muted` | `--text-tertiary` |
| Accent hover | `--accent-hover` | `--accent-strong` |
| Radius (default) | `--radius-md` (6px) | `--radius` |
| Shadow (popover) | `--elev-3` | `--shadow-md` |
| Modal stack | `var(--z-modal-default)` | `z-index: 1000` (replaced) |

New code uses the newest API. Existing component CSS keeps working via the aliases; migrations happen during Phase 1.5–1.9.

---

## 1. Spacing — 4pt base, 8pt-dominant rhythm

```css
--space-0:  0
--space-px: 1px    /* hairlines only */
--space-1:  2px    /* icon→text micro nudge, badge padding-y */
--space-2:  4px    /* tight inline (= legacy --sp-1) */
--space-3:  8px    /* default gap inside a row (= legacy --sp-2) */
--space-4:  12px   /* input padding-y (= legacy --sp-3) */
--space-5:  16px   /* default component padding (= legacy --sp-4) */
--space-6:  24px   /* section gap (= legacy --sp-6) */
--space-8:  32px   /* modal padding (= legacy --sp-8) */
--space-10: 48px   /* large vertical rhythm */
--space-12: 64px   /* page-level separation */
```

**Use guide:**

- `1/2` = atomic (inside a control)
- `3/4/5` = component (the workhorses — 80% of use)
- `6/8` = layout
- `10/12` = page

**Tailwind utility:** `p-3` = `padding: 12px` (3 × 4px base). The `--spacing: 4px` is set in the `@theme` block.

---

## 2. Type scale — 1.125 ratio, Inter Variable

| Token | px | Line-height | Weight | Use |
|---|---|---|---|---|
| `--text-caption` | 11 | 16 (1.45) | 500 | timestamps, badges, kbd hints |
| `--text-body-sm` | 12 | 18 (1.5)  | 400 | dense lists, table cells, terminal |
| `--text-body`    | 13 | 20 (1.54) | 400 | **default UI text** |
| `--text-body-lg` | 15 | 24 (1.6)  | 400 | editor prose, dialogs |
| `--text-h4`      | 16 | 24 (1.5)  | 600 | card titles |
| `--text-h3`      | 18 | 26 (1.44) | 600 | panel headers |
| `--text-h2`      | 22 | 30 (1.36) | 600 | modal titles |
| `--text-h1`      | 28 | 36 (1.28) | 700 | page titles |
| `--text-display` | 32 | tight     | 700 | hero / brand |

Body anchored at **13px** = Linear/Cursor density. Bump to 14px if non-coder feedback says it's too tight.

Legacy `--fs-*` names stay valid: `--fs-md` = 14px (was the previous default body size).

---

## 3. Color — semantic, two-tier

Three layers:

1. **Raw palette** — hex values, only in `theme.css`. Never reference directly in components.
2. **Semantic CSS vars** — `--bg-surface`, `--text-primary`, etc. — what components read.
3. **Tailwind utilities** — `bg-canvas`, `text-muted`, `border-strong` — generated from `@theme`.

### Surfaces (dark default · light via `[data-theme="light"]`)

| Var | Dark | Light | Use |
|---|---|---|---|
| `--bg-canvas`   | #0E0F11 | #FAFAFA | app background |
| `--bg-surface`  | #15171B | #F4F4F5 | panels, sidebar |
| `--bg-elevated` | #1C1F25 | #FFFFFF | modals, dropdowns, inputs |
| `--bg-overlay`  | rgba(255,255,255,.04) | rgba(0,0,0,.04) | hovered rows |
| `--bg-sunken`   | #0a0b0d | #F1F1F4 | code blocks, terminal |

### Text

| Var | Dark | Light | Contrast on canvas |
|---|---|---|---|
| `--text-primary`   | #E6E8EC | #18181B | 16:1 dark / 19:1 light |
| `--text-secondary` | #9AA0AB | #52525B | 7:1 dark / 11:1 light |
| `--text-muted` *(=`--text-tertiary`)* | #7A8596 | #71717A | 6:1 dark / 4.7:1 light — both **AA** |
| `--text-disabled` (alias of muted) | — | — | non-text only |

> Phase 0.9 (2026-05-11) bumped tertiary in both themes to clear WCAG 1.4.3 AA.

### Borders

| Var | Dark | Light |
|---|---|---|
| `--border-subtle` | #232730 | #E4E4E7 |
| `--border-default` (alias of subtle) | — | — |
| `--border-strong` | #303640 | #D4D4D8 |

### Accent + Status

| Var | Dark | Light |
|---|---|---|
| `--accent`         | #7C8FFC | #5764E5 |
| `--accent-hover` (= `--accent-strong`) | #6578E8 | #4753C8 |
| `--accent-active`  | #5564D0 | #3A45A8 |
| `--accent-soft`    | rgba(124,143,252,.13) | rgba(87,100,229,.10) |
| `--accent-fg` (= `--text-on-accent`) | #0E0F11 | #FFFFFF |
| `--danger`         | #E55C5C | #DC2626 |
| `--danger-hover`   | #D14444 | #B91C1C |
| `--success`        | #62C98A | #16A34A |
| `--success-hover`  | #4FB675 | #15803D |
| `--warning`        | #E6A23C | #D97706 |
| `--info`           | #5CA9F2 | #2563EB |

**Convention for interactive states:** use `--bg-overlay` for hover *backgrounds* on neutral rows; use `--accent-hover` / `--accent-active` for primary actions; use `--focus-ring` (already defined) for keyboard focus.

---

## 4. Radius

```css
--radius-sm:   4px     /* badges, chips, kbd */
--radius-md:   6px     /* buttons, inputs, list rows (alias of --radius) */
--radius-lg:   8px     /* cards, panels, popovers */
--radius-xl:  12px     /* modals, command palette */
--radius-2xl: 16px     /* hero illustrations */
--radius-pill: 9999px  /* pills, status dots, avatars (alias --radius-full) */
```

---

## 5. Elevation — dark-aware

In dark UIs shadows alone don't read — pair with a 1px white inner border so the lifted surface separates from canvas. The `--elev-N` tokens encode this. Light mode uses classic stacked shadows.

```css
--elev-1   /* row hover */
--elev-2   /* card, sticky toolbar */
--elev-3   /* popover, dropdown, menu */
--elev-4   /* modal, command palette */
```

Legacy `--shadow-sm/-md/-lg` stay valid.

---

## 6. z-index — stratified

```css
--z-base:            1
--z-sticky:          5    /* sticky toolbar, tab underline */
--z-overlay-local:  10    /* heading-picker dropdown */
--z-overlay-pane:   50    /* picker menu inside a pane */
--z-overlay-editor: 200   /* drop overlay, import toast */
--z-modal-default:  1000  /* CommandPalette, Settings, SearchPanel, slash menu */
--z-modal-important:1100  /* DriveEjected, EditorPane conflict dialog */
--z-modal-critical: 1200  /* ShortcutsOverlay, ContextMenu (must beat) */
--z-modal-top:      1300  /* reserved — urgent confirmations */
```

**Rule:** never use a numeric `z-index` ≥ 5 in component CSS. Use the token.

> Phase 1.4 (2026-05-11) migrated every modal-range numeric to a token. The only numerics remaining are pane-local (2, 3, 6, 7) where collision risk is zero.

---

## 7. Icon sizes

```css
--icon-xs: 11px   /* status pills, micro-UI */
--icon-sm: 12px   /* inline with body-sm text */
--icon-md: 14px   /* default UI (toolbar buttons, list rows) */
--icon-lg: 16px   /* sticky toolbars, slash menu */
--icon-xl: 20px   /* tab close, large buttons */
```

Lucide's `size={N}` prop takes a number — reference the CSS var via `getComputedStyle` or just hardcode the same pixel value the token holds. (We can't pass `var(--icon-md)` directly to a number prop; this is a known limitation.)

---

## 8. Motion

```css
--ease-out:  cubic-bezier(0.22, 1, 0.36, 1)
--dur-fast:  120ms   /* hover, dismiss */
--dur-base:  160ms   /* default (screen-in, modal fade) */
--dur-slow:  240ms   /* considered transitions */
```

Honors `prefers-reduced-motion: reduce` (all durations zero out).

---

## 9. Tailwind v4 `@theme` mapping

The `@theme` block in `theme.css` exposes CSS vars to Tailwind:

```css
@theme {
  --color-canvas: var(--bg-canvas);
  --color-accent: var(--accent);
  --text-body:    var(--text-body);
  --radius-md:    var(--radius-md);
  --shadow-elev-3: var(--elev-3);
  ...
}
```

Generated utilities:

```html
<div class="bg-surface text-body-lg p-5 rounded-md shadow-elev-3 border border-default">…</div>
```

All utilities respect runtime theme swaps (light/dark) because they reference CSS vars, not literals.

---

## 10. Migration policy

- **Don't rip out legacy aliases en masse.** They're cheap. Migrate per-component during Phase 1.5–1.9 refactors.
- **New code → new tokens.** No reason to ship `--sp-2` in a file written today.
- **Don't add new aliases.** If the existing pair (e.g. `--bg-pane` ↔ `--bg-surface`) doesn't fit a new use case, propose a third token via PR — don't just create one ad-hoc.
- **Lint rule planned (Phase 11.7):** forbid raw hex / pixel values outside `theme.css`. Stylelint custom rule.

---

## 11. Related

- `arasul-app/src/theme.css` — implementation
- `docs/arasul-design-spec.md` — direction 1A · Linear-clean
- `docs/plans/2026-05-11-frontend-ux-overhaul.md` — Phase 1 (this work)
- `https://tailwindcss.com/docs/theme` — Tailwind v4 `@theme` reference
- `https://www.radix-ui.com/primitives` — Radix primitives we wrap
