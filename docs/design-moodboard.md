# Arasul — Design Moodboard

> Phase 0 Step 0.11 deliverable. Companion artifact: `docs/design/dashboard-mockup.html` — open in a browser and toggle between the three directions with the buttons at the top-right.
>
> **Decision point for Kolja:** pick one of 1A / 1B / 1C. The winner gets copied into `arasul-design-spec.md` §1 and §4 and becomes the source of truth for Phase 1 UI work.

---

## How to read this doc

Each direction is a self-contained design system: palette, typography, spacing, motion, and component vocabulary. The design tokens below are the exact CSS custom-property values used in the companion mockup — so what you see in the browser *is* the spec.

All three directions share the same **layout and copy** (three-pane dashboard per `arasul-design-spec.md` §2.2 and §5). The only variables are the visual language. That isolates the decision.

---

## Shared foundation

Regardless of direction, these are locked:

- **Layout:** three-pane FULL tier at ≥1280px (tree 240 · editor flex · right 380)
- **Typography base:** 14px body, system-ui fallback stack
- **Voice:** *Present. Calm. Capable.* — see arasul-design-spec.md §5.1
- **Accessibility floor:** WCAG AA contrast (4.5:1 body, 3:1 large)
- **No gratuitous motion:** transitions under 200ms; prefers-reduced-motion honoured
- **No emoji in UI chrome.** Inline content (chat, notes) is user's choice.

---

## 1A. Linear-clean

**Feel:** a serious professional tool. Quiet, precise, nothing competing for attention. The content is the hero; the chrome disappears.

**Inspiration anchors:** Linear.app, Things 3, Bear, Figma comments pane.

### Palette


| Token              | Value       | Usage                              |
| ------------------ | ----------- | ---------------------------------- |
| `--bg-canvas`      | `#0E0F11`   | app background                     |
| `--bg-pane`        | `#15171B`   | pane surfaces                      |
| `--bg-elevated`    | `#1C1F25`   | menus, hover surfaces              |
| `--border-subtle`  | `#232730`   | pane dividers, 1px                 |
| `--border-strong`  | `#303640`   | focused inputs, active tabs        |
| `--text-primary`   | `#E6E8EC`   | body                               |
| `--text-secondary` | `#9AA0AB`   | labels, timestamps                 |
| `--text-tertiary`  | `#636976`   | metadata, disabled                 |
| `--accent`         | `#7C8FFC`   | single accent — links, focus, CTAs |
| `--accent-soft`    | `#7C8FFC22` | selected row background            |
| `--danger`         | `#E55C5C`   | destructive actions only           |
| `--success`        | `#62C98A`   | saved/confirmed states             |


### Typography

- **Sans:** `Geist, Inter, -apple-system, sans-serif`
- **Mono:** `Geist Mono, "SF Mono", Consolas, monospace`
- **Scale:** 12 / 13 / 14 / 16 / 20 / 28 — modest contrast
- **Weights:** 400 body, 500 UI, 600 headings. No 700.

### Spacing + density

- Base unit: 4px. Padding: `4 / 8 / 12 / 16 / 24 / 32`.
- Row height: 28px in tree, 32px in editor tab bar.
- Pane padding: 16px horizontal, 12px vertical.
- Tight but not cramped. Think Linear's inbox.

### Components

- **Borders over shadows.** 1px `--border-subtle` lines, no drop shadows beyond focus rings.
- **Hover = 4% white overlay.** Click = 8%.
- **Focus ring:** 2px `--accent` with 2px offset from element edge.
- **Buttons:** ghost-first. Primary button only at CTAs (onboarding, vault create).
- **Icons:** Lucide at 16/20px, 1.5px stroke, `--text-secondary`.

### Motion

- 120ms ease for all state changes.
- No shimmer, no bounce, no gradient sweeps.

### Copy tone

Mirrors the voice spec exactly. Think professional colleague who doesn't waste words.

---

## 1B. Obsidian-dense

**Feel:** a power-user's workshop. Every pixel earns its place. The power-user rewards loom over first-time friendliness; we bet they'll grow into it.

**Inspiration anchors:** Obsidian, Zed, old-school IDEs, Bloomberg terminal at 5% saturation.

### Palette — warm dark


| Token              | Value     | Usage                              |
| ------------------ | --------- | ---------------------------------- |
| `--bg-canvas`      | `#181613` | app background (warm near-black)   |
| `--bg-pane`        | `#201D18` | pane surfaces                      |
| `--bg-elevated`    | `#29251E` | menus                              |
| `--border-subtle`  | `#33302A` | pane dividers                      |
| `--border-strong`  | `#4A4639` | active focus                       |
| `--text-primary`   | `#EDE7D7` | body (warm off-white)              |
| `--text-secondary` | `#A89F8A` | labels                             |
| `--text-tertiary`  | `#706A5C` | metadata                           |
| `--accent-tree`    | `#E6A23C` | tree accent (folders, selection)   |
| `--accent-editor`  | `#7BB662` | editor accent (cursor, active tab) |
| `--accent-chat`    | `#66A3E0` | chat accent                        |
| `--accent-term`    | `#D16B6B` | terminal accent                    |
| `--link`           | `#D8B46A` | links across panes                 |


Note the per-pane accent colours — this is signature Obsidian-dense. It gives the brain a visual anchor when scanning between panes.

### Typography

- **Sans:** `Inter, -apple-system, sans-serif`
- **Mono:** `Berkeley Mono, "JetBrains Mono", Consolas, monospace`
- **Scale:** 11 / 12 / 13 / 14 / 18 / 24 — tighter, more information per inch.
- **Weights:** 400, 600. Bold is load-bearing, not decorative.

### Spacing + density

- Base unit: 2px. Padding: `2 / 4 / 8 / 12 / 16`.
- Row height: 22px tree, 26px editor tab bar.
- Pane padding: 8px. Terminal has *zero* padding — maximises visible lines.
- ~30% more information on screen vs 1A.

### Components

- **Visible structure lines** between logical regions — not just between panes.
- **Hover = 6% warm overlay.** Row selection shows both left-border (3px accent) *and* subtle fill.
- **Focus ring:** dotted 1px `--border-strong` + 1px offset. Subtle on purpose.
- **Icons:** Lucide 14px, 2px stroke. Tighter + more visible.
- **Status indicators everywhere:** unsaved dots, git-dirty marks, diff counts next to files.

### Motion

- 80ms snap on all transitions. Instant is the aesthetic.
- Status dots throb at 2s cadence only when attention needed.

### Copy tone

Dense. No prose greetings. Tree label says "content/" not "Your notes".

---

## 1C. Arc-confident

**Feel:** a polished, modern consumer product that happens to be deeply technical. Generous, confident, delightful. The app makes you feel smart for picking it.

**Inspiration anchors:** Arc browser, Raycast, Apple Shortcuts sidebar, good music-player UIs.

### Palette — vibrant dark with gradients


| Token              | Value                                     | Usage                          |
| ------------------ | ----------------------------------------- | ------------------------------ |
| `--bg-canvas`      | `radial-gradient(…)` (see mockup)         | app background                 |
| `--bg-pane`        | `rgba(22, 20, 30, 0.72)` on blur          | pane surfaces — glass morphism |
| `--bg-elevated`    | `rgba(30, 28, 45, 0.88)` on blur          | menus                          |
| `--border-subtle`  | `rgba(255,255,255,0.06)`                  | pane dividers                  |
| `--text-primary`   | `#F2EEFF`                                 | body                           |
| `--text-secondary` | `#B0A8D1`                                 | labels                         |
| `--text-tertiary`  | `#766E96`                                 | metadata                       |
| `--accent-primary` | `linear-gradient(120deg,#8A67FF,#FF6B9D)` | brand gradient — logo + CTAs   |
| `--accent-solid`   | `#A78BFF`                                 | single-colour fallback         |
| `--accent-glow`    | `0 0 24px #8A67FF40`                      | focused element glow           |
| `--danger`         | `#FF5E84`                                 | destructive                    |
| `--success`        | `#5EEAD4`                                 | saved                          |


### Typography

- **Sans:** `"Söhne", "Neue Haas Unica", -apple-system, sans-serif`
  - Söhne is licensed ($300+/year); budget option: `Inter` with tighter `letter-spacing: -0.01em`.
- **Display:** `"Söhne Breit"` or `"Instrument Serif"` for onboarding hero copy
- **Mono:** `"Berkeley Mono"` — same as 1B but used sparingly (terminal only)
- **Scale:** 13 / 14 / 15 / 18 / 24 / 36 — generous, confident.
- **Weights:** 400, 500, 600, 700. Bold is freely used.

### Spacing + density

- Base unit: 6px. Padding: `6 / 12 / 18 / 24 / 36 / 48`.
- Row height: 34px tree, 38px editor tab bar.
- Pane padding: 24px. Breathing room is the point.
- ~20% less information on screen vs 1A. Tradeoff: feels premium.

### Components

- **Glass morphism** on pane surfaces — 16px backdrop-blur.
- **Subtle gradients** throughout — subtle enough that a screenshot looks flat, bold enough that the app feels alive.
- **Hover = brighten + lift** (2px translateY on pointer-friendly items).
- **Focus ring:** 2px `--accent-solid` with `--accent-glow` outer halo.
- **Buttons:** gradient-primary at CTAs, glass-ghost elsewhere. Rounded `8px`.
- **Icons:** Lucide 18px 1.75px stroke. Slightly larger than 1A/1B.

### Motion

- 240ms ease-out for hover. 320ms for pane transitions.
- Subtle parallax on scroll in chat.
- Onboarding has one 15-second ambient animation; dashboard is calm.

### Copy tone

Warmer than 1A/1B. "Welcome back" instead of "Unlock." Not childish — confident-friendly.

---

## 2. Decision criteria

Pick based on **target user** — the same copy serves all three, but the *signal* differs:


| Direction | Signals to user                               | Risk                            |
| --------- | --------------------------------------------- | ------------------------------- |
| **1A**    | "professional, serious, trusted workhorse"    | might feel austere to non-devs  |
| **1B**    | "expert-grade; I'll be in here all day"       | intimidates first-time students |
| **1C**    | "this is a product with taste; worth keeping" | may feel like it hides depth    |


### Gut check

The Phase 0 exit criterion is that **a non-technical student feels this is worth keeping on their drive**. Which direction does that best?

- 1A says: trust us, we're grownups.
- 1B says: you're going to love how much is on screen.
- 1C says: this is the one you show your friends.

My read: **1C** has the highest conversion on first open — the target is "non-technical student," and students respond to polish. **1A** is the safest — but "safe" has never won a consumer product. **1B** is my personal favourite (and Kolja's, based on the existing v3 TUI) — but it's the biggest bet on the user growing into the interface. (— Claude, 2026-04-24)

The decision is yours. Open `docs/design/dashboard-mockup.html`, flip between them, pick.

---

## 3. What happens after decision

1. Kolja sets `direction = "1A" | "1B" | "1C"` in `memory/config.toml`.
2. `docs/arasul-design-spec.md` §1 is rewritten to contain only the chosen direction (delete the other two).
3. The CSS tokens for the chosen direction are copied into
  `arasul-app/src/theme.css` as `:root` custom properties.
4. `arasul-app/src/App.css` inherits those tokens — the current PTY hello-world becomes the seed of Phase 1 UI.
5. Figma file created with the chosen palette; all Phase 1-4 components designed in Figma first, then coded.

---

## 4. Non-decisions this doc does *not* make

- **Light mode.** All three directions are dark-first for v1. Light-mode variants are Phase 2 work. Frozen: dark is default.
- **Typography purchase.** Söhne (1C preferred) is paid. If budget rejects, 1C falls back to Inter with tighter tracking — design still works.
- **Component library.** Phase 1 decision: Radix primitives + handwritten styling vs. shadcn/ui vs. fully custom. All three directions work with any of those; this doc doesn't pre-bake that choice.

