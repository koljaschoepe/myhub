/**
 * Ladle config — Vite-native story runner for the components/ui/
 * primitives (Phase 11.1, 2026-05-11).
 *
 * Stories live alongside components in `src/components/ui/*.stories.tsx`.
 * `pnpm ladle` boots a dev server; `pnpm ladle:build` exports a static
 * site you can drop into Vercel / GitHub Pages for visual-regression
 * review.
 *
 * Reference: https://ladle.dev/docs/config
 */
export default {
  stories: "src/**/*.stories.{ts,tsx}",
  port: 61000,
  defaultStory: "ui-button--primary",
  appendToHead: `<link rel="stylesheet" href="/src/theme.css" />`,
};
