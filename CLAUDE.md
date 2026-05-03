# Photography Portfolio — agent instructions

A minimalist Astro photography site. The README covers the user-facing architecture; this file captures the conventions and gotchas you need to know to work on the code.

## Workflow

- **Small/trivial changes** → commit directly to `main`.
- **Larger features / multi-file refactors** → branch, push, open a PR with `gh pr create`. Squash-merge: `gh pr merge <n> --squash --delete-branch`.
- Branch naming: `feat/short-description`, `fix/short-description`, `docs/short-description`.
- **CI runs only on push to `main`** (deploy + Playwright e2e). PRs don't have automated checks; the local build is the gate. Always run `pnpm build` and `pnpm exec vitest run` before opening a PR.
- The deploy worktree at `.claude/worktrees/from-main` keeps `main` checked out, so `gh pr merge` will fail at the local checkout step. Fall back to manually `git push origin --delete <branch>; git fetch --prune; git checkout --detach origin/main; git branch -D <branch>` to clean up locally.

## Build / dev commands

```sh
pnpm dev                          # http://localhost:4321 (auto-bumps if busy)
pnpm build                         # astro check + astro build
pnpm exec vitest run              # unit tests
pnpm tsx scripts/<name>.ts        # ad-hoc Node scripts
```

`astro check` OOMs on a stale `dist/`. If the build fails with v8 abort, `rm -rf dist node_modules/.astro .astro` and rebuild.

## Editing CSS

CSS files in `src/styles/` are large and reliably stall the `Write` tool. **Always use targeted `Edit` calls.** For sweeping changes (color tokens, spacing scale), write a Node script.

## Content collections

The site uses Astro 5's content layer with Zod schemas in `src/content.config.ts`. Six collections:

- `photos` — atomic photos (yaml in `src/data/photos/`)
- `albums` — legacy ordered photo lists (yaml in `src/data/albums/`)
- `essays` — full per-essay photo manifest (yaml in `src/data/essays/`)
- `photoCollections` — regions (yaml in `src/data/collections/`)
- `settings` — site-wide config (`src/data/settings.yaml`)
- `blog` — Substack RSS via `src/data/loaders/substack-loader.ts`

**Astro 5 glob loader gotcha**: a top-level `slug` field in the YAML overrides the entry ID derived from the filename. The schema for `essays` deliberately omits `slug` — entries are addressed by their filename (e.g. `morocco-wise-essay`).

**Essay reference shape**: collection YAMLs carry essays as a string list (`essays: [morocco-wise-essay, …]`), not an inline blob. Title, description, photo count, and cover are all derived from the essay's own data. Don't reintroduce the blob.

**Albums vs essays**: essays replace albums as the primary unit. `archiveAlbums` is the surviving field on collections — a list of album IDs surfaced under a `<details>` archive on the collection page.

## Persistent map architecture

One MapLibre instance lives in `BaseLayout` with `transition:persist="map"`. It survives every page swap. Pages don't mount their own map — they declare a layout role + target camera state via props on `PageLayout` / `ProjectLayout`, and the persistent shell does the rest.

Key invariants:

- `body[data-map-layout]` is the source of truth for the current role: `world` | `region` | `inset` | `hidden`.
- `body[data-map-target-center]` / `data-map-target-zoom` / `data-map-active-collection` carry the camera + filter state.
- `PersistentMap.astro` SSR-aggregates **all** markers + region polygons across every collection, tagged with `view` and `collectionId`. Don't add per-page marker data — extend the aggregation if needed.
- The map's viewport rect is **JS-driven** from a slot element. Pages mark their slot with `data-map-presence-anchor` (or `data-map-inset-slot` for essay map slides). A rAF loop in `persistent-map-init.ts` reads the slot's `getBoundingClientRect()` and writes `--map-shell-{top,left,width,height}` on `<body>`. The map (`position: fixed`) follows the slot through scroll.
- Marker `num` must be globally unique. The aggregator prefixes them (`world-NN`, `<collectionId>-NN`). A separate `displayNum` keeps the visible badge clean. Don't compare against raw `"01"` — match against the prefixed form.
- `regions-hatch` is added asynchronously by `map-init.ts` after the crosshatch image loads. Re-apply `setFilter` on `map.once('idle', …)` after the initial call, or it'll silently miss.
- `interactive: false` on the persistent map. The camera is app-controlled (`map.flyTo` on swap). Don't enable scroll/zoom — users would drift away from the declared view.

Click behavior:
- Desktop `/work` (world layout): click → lock map + auto-expand dossier.
- Desktop region/inset/hidden: click → navigate to marker target.
- Mobile (any layout): click → navigate. No lock.

Files:
- `src/components/PersistentMap.astro` — SSR aggregation + the persistent shell
- `src/scripts/persistent-map-init.ts` — runtime controller
- `src/scripts/map-init.ts` — generic MapLibre setup. Exposes `__map`, `__setLocked`, `__setHovered` on the container for external scripts.

## Page structure on /work and below

- **`/work`** — dossier panel + filmstrip + persistent map at world layout. Right-side panel is `.dossier-collection` rows (collapsible button → nested essay anchors). On mobile the panel hides; tapping a region opens `.story-sheet` (mobile bottom sheet).
- **`/work/[collection]`** — region page: header → map slot → carousel → essay cards → archive `<details>`. Filter logic on the persistent map zooms the camera + reveals only that collection's sub-region polygons.
- **Essays** (`*-essay.astro`) — full-bleed snap scroll. Map docks into `EssaySlideMapInset` slots when scrolled into view. Default `mapLayout="hidden"` so the map collapses on non-inset slides.

## Component conventions

- **Animations**: `reveal` is unreliable on grid children sharing a row (GSAP ScrollTrigger fires inconsistently for items 3+). Use `stagger-children` on the parent grid instead. See `feedback_use_map_system_not_svg.md` and `animations-gotchas.md` in agent memory if applicable.
- **Container**: caps content at `--container-max: 1440px`. Use it for text, NOT for photo grids — those should be full-bleed with `padding-inline: var(--container-padding)`.
- **Astro scoped styles** use data attributes; `:global(...)` is needed to target child component classes from a parent. The persistent map and dossier sheet styles use `:global()` extensively.
- **Mobile breakpoint**: `1023px` is the dossier-vs-sheet switch and the SideRail vs no-rail switch. Below that → mobile.

## Gotchas

- **Don't use `<template>` for JSON data** — Astro HTML-encodes content (`&quot;` breaks `JSON.parse`). Use `<script type="application/json" set:html={JSON.stringify(data)}>` + `.textContent` instead.
- **YAML dates must be quoted** (`date: "2024-10"`) or YAML parses them as numbers.
- **`git rm` fails on locally modified files** — need `-f` flag.
- **`git mv` fails on untracked files** — use plain `mv` instead.
- **`Map` import shadowing**: `import Map from '@components/Map.astro'` shadows the JS `Map` constructor. If a file uses `new Map(…)`, alias the import (e.g. `import MapComponent from '@components/Map.astro'`).
- **The persistent map needs a non-zero container at MapLibre init** — the shell defaults to viewport size (invisible, opacity 0). The controller adds `.is-ready` once it's positioned, then the map fades in.

## Image pipeline

`_raw/` → `pnpm process-images` → `_processed/` → `pnpm upload-images` → CDN → `pnpm generate-yaml`. Standard widths: 640, 750, 1080, 1600, 2400. Native-width variant is generated when the source falls between breakpoints (e.g. 2048px). `Photo.astro` srcset and `lightbox.ts` both account for this.

## Substack feed

`pnpm fetch-rss` → `src/data/substack-feed.xml` → blog collection via custom loader. Substack blocks cloud CI runners, so the cache file is committed. Update locally and push to deploy fresh notes.

## Where to look for refactor history

- `docs/work-refactor-plan.md` — the canonical plan covering Phases 1–5 of the Work refactor (essays content collection, region pages, dossier nesting, persistent map, mobile pass).
