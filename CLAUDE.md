# heist.studio — agent instructions

Read `README.md` first: it describes the site, the story format, and publishing.

**Design language:** before any design or front-end change, read the Linear document "heist.studio Design Language" (Studio team): https://linear.app/corbinheist/document/heiststudio-design-language-d3b57f1b1c0f. It is authoritative. A component that disagrees with it is a defect. To change a rule, update the document in the same change and add a change-log line.

## Workflow

- Branch and PR for every change (`stu-NN-…` from the Linear issue, team STU). Squash-merge.
- CI runs only on push to `main`, and a merge to `main` deploys the live site. Before a PR merges: `pnpm build`, `pnpm exec vitest run`, `pnpm test:e2e:built`.
- Throttle heavy local builds when other work runs: `nice -n 15`.
- If `astro check` runs out of memory: `rm -rf dist .astro node_modules/.astro` and rebuild.

## Rules

- **Copy:** every label and caption is backed by a measurement, a date, a name, or a photograph. Never invent a place, a time, an elevation, or a photo title. Corbin's prose is never rewritten without asking.
- **Numbers are computed:** frame numbers, frame counts, story numbers, kit, previous and next. Never type them.
- **One story, one URL:** `/work/<slug>/`. No `url` overrides, no regions, no albums. A changed slug needs a redirect in `astro.config.mjs`.
- **No new runtime JavaScript** without a reason. Prefer CSS (scroll-driven animations, view transitions, `<details>`).
- **Accessibility:** every image has real alt text; the axe e2e scan must pass at desktop and phone widths.
- The decks in `decks/` share no code with the site. Changes there do not touch `src/`.

## Gotchas

- Rail titles and places stay on one line. If a new story's title or place ends in an ellipsis in the rail, raise `--rail-w` in `SiteNav.astro`.

- YAML dates must be quoted (`date: "2025-11"`).
- Astro scoped styles need `:global(...)` to reach child component markup.
- Do not use `<template>` for JSON data; use `<script type="application/json" set:html={…}>`.
- Chrome corrupts full-page screenshots above about 16,000 px; capture long pages in pieces.
- The image CDN path is `<url>/<slug>-<width>.<format>`; see `src/scripts/utils/photo-widths.ts`.
