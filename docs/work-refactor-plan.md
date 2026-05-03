# Work Refactor — Geocentric Hierarchy

**Status: shipped.** Phases 1–5 are merged to `main` and deployed. Phase 4b part 2 (home page hero) is intentionally deferred. See [Phase rollout](#phase-rollout) for the as-built record + [What changed vs. the plan](#what-changed-vs-the-plan) for divergences.

**Goal:** Restore the `Work → Collection → Essay` tree as the navigational spine of the site. Essays absorb albums (albums become archive). Collection pages become real region pages with their own copy and a carousel aggregated from their essays. The world map zooms continuously across page transitions, site-wide.

**Non-goals:** redesigning the essay reader, reworking blog/notes, touching the gallery page, mobile experience (deferred to a final pass).

---

## Target IA

```
/work                           World map + collapsible dossier of collections
  └── /work/[collection]        Region page — copy, regional map, carousel, essay cards, archive
        └── /work/[collection]/[essay]   Essay (existing, unchanged structurally)
```

- **Collections** are the primary unit on `/work`. Each row expands to reveal its essays.
- **Essays** replace albums as the canonical content leaf.
- **Albums** survive only as an "Archive" appendix on the collection page.

---

## Decisions locked in

1. Essays replace albums; albums → archive section at the bottom of collection page.
2. True map zoom across page transitions, not a `flyTo` illusion on a fresh map.
3. Work-page dossier rows = **collections, collapsible**; essays nest underneath.
4. Intro copy lives in a sidecar `.md` file per collection.
5. Persistent map is **site-wide** (one instance, persisted across all nav).
6. Carousel order: **round-robin** across the collection's essays (matches the existing `/work` filmstrip pattern).
7. Regional markers continue to target essays directly (skipping the collection page).
8. **Desktop first.** Mobile is the final phase.

---

## Phase 1 — Data lift (unblocks the carousel)

Each essay's photo manifest currently lives inline in its `.astro` file (~30–40 photos × URL/width/height/lqip/title). This is the only blocker for collection-level aggregation.

**Move:** photo manifests → YAML sidecars under `src/data/essays/`.

Layout choices in the essay (which slide gets which photo, prose, slide types) **stay in the `.astro` file** — only the photo metadata moves.

### New content collection: `essays`

```ts
// src/content.config.ts
const essays = defineCollection({
  loader: glob({ pattern: '**/*.yaml', base: './src/data/essays' }),
  schema: z.object({
    slug: z.string(),                       // e.g. "wise-essay"
    collectionId: z.string(),               // e.g. "morocco"
    title: z.string(),
    description: z.string().optional(),
    date: z.string().optional(),
    location: z.string().optional(),
    coverPhotoIndex: z.number().default(0), // index into photos[]
    photos: z.array(z.object({
      url: z.string(),
      width: z.number(),
      height: z.number(),
      lqip: z.string(),
      title: z.string().optional(),
    })),
  }),
});
```

### Per-essay file shape

`src/data/essays/morocco-wise-essay.yaml`:
```yaml
slug: wise-essay
collectionId: morocco
title: The Bougmez Underfoot
description: One day in Morocco's High Atlas — gorge, pass, and darkness.
date: "2025-11-12"
location: Aït Bougmez, High Atlas
coverPhotoIndex: 0
photos:
  - url: https://heist-studio.../heist-wise-essay-027-cnh_4995
    width: 8192
    height: 5464
    lqip: data:image/webp;base64,...
    title: Into the Gorge
  - ...
```

### Essay `.astro` change

```ts
import { getEntry } from 'astro:content';
const essay = await getEntry('essays', 'morocco-wise-essay');
const photos = essay.data.photos;
// ...rest of the file unchanged
```

### `photoCollections` schema cleanup

Drop the inline `essays: [{slug, title, coverImage, photoCount}]` blob. Replace with a reference list:

```yaml
# morocco.yaml
essays:
  - morocco-nomads-essay
  - morocco-ksar-essay
  - morocco-wise-essay
```

The collection page resolves these via `getEntry('essays', id)`. Cover image, title, and photoCount become derivable, eliminating the duplicate-source-of-truth problem.

### Migration script (the gate for Phase 1)

This script is the deliverable that lands first, *before any production change ships*. Phase 1 is not "lift the data" — it's "build the script, prove it works, then apply it."

**Location:** `scripts/lift-essay-photos.ts` (or `.mjs`).

**What it does:**
1. Walks `src/pages/work/**/*.astro` looking for the canonical pattern: a top-level `const photos = [ ... ]` array with photo objects (`url`, `width`, `height`, `lqip`, `title`).
2. Parses that array (AST via `@babel/parser` or similar — regex is too brittle given the inline `/* … */` comments and template literals like `${CDN}/heist-wise-essay-...`).
3. Resolves the `${CDN}` template into the actual URL string by reading the `const CDN` declaration in the same file.
4. For each essay file, emits `src/data/essays/<collectionId>-<slug>.yaml` with the schema above. `collectionId` and `slug` derive from the file path (`src/pages/work/morocco/wise-essay.astro` → `morocco` + `wise-essay`).
5. Updates the `.astro` file: replace the inline array with `import` + lookup. Keep the `/* index — caption */` comments by attaching them as the `title:` field where they're useful (the wise essay already does this).
6. Writes the new reference-list `essays:` field into each `src/data/collections/*.yaml`, replacing the legacy blob.
7. Renames `albums:` → `archiveAlbums:` in each collection YAML.

**Flags:**
- `--dry-run` — print what would change. No writes. **Default mode.**
- `--write` — apply changes.
- `--essay <path>` — process a single essay (for incremental verification).

**Out of scope for the script:**
- Touching essays that don't follow the canonical `const photos = [...]` shape. Print a warning and skip; we'll review by hand.
- Modifying slide composition or any other part of the essay file.

### Testing gate

Phase 1 ships only after this verification sequence passes:

1. **Run dry-run on the full repo.** Inspect the diff for one essay (suggest `wise-essay` — newest, cleanest). Eyeball the YAML and the `.astro` rewrite.
2. **Apply with `--write` on a single essay** (`--essay wise-essay`). Run `pnpm build`. Visually diff the rendered essay before/after using `playwright` or just `pnpm dev` + manual check.
3. **Snapshot test (one-off):** add a temporary Vitest spec that imports the essay's photos via `getEntry('essays', ...)` and asserts the array length and first/last URLs match the values from the original inline array. Delete after the migration lands.
4. **Apply to remaining essays** one at a time, building between each.
5. **Run the full Playwright suite** (`pnpm test:e2e` if it exists, or whatever the smoke check is) to catch any visual regression on the essay reader, the collection landing page, and the work index.
6. Only after all of the above, the PR opens.

If any step fails, fix the script — never hand-edit the YAML to paper over a bug, because we may need to re-run the migration on essays added later.

### Risk if the script is wrong

Each essay's photos are referenced by *index* throughout the slide composition (e.g. `<EssaySlideHero photo={photos[0]} />`). The script must preserve order exactly. Order-preservation is the single property the testing gate has to prove — that's what the snapshot test checks.

---

## Phase 2 — Collection page rebuild

`src/pages/work/[collection]/index.astro` becomes a region page.

### New schema fields on `photoCollections`

```ts
archiveAlbums: z.array(z.string()).default([]),   // renamed from `albums`
```

Intro copy lives in a sidecar markdown file: `src/data/collections/<id>.md`. The collection loader picks it up alongside the YAML (or the page resolves it via `import.meta.glob('/src/data/collections/*.md')`). Frontmatter is optional — the YAML already carries title/description/etc.

```md
<!-- src/data/collections/morocco.md -->
The Atlas drops south through the Draa, then breaks into the Saghro before
flattening into the Sahara…

A second paragraph about retreat context, terrain, voice.
```

Migration: rename `albums:` → `archiveAlbums:` in each YAML. Delete legacy `essays: [{}]` blob (replaced by Phase 1's reference list). Create a `.md` sidecar for each collection (start as a stub; copy gets refined later).

### Page structure (top → bottom)

1. **Breadcrumb + title** (existing, keep tight)
2. **Regional map** — full-bleed, `transition:name="world-map"` (Phase 4 wires the zoom)
3. **Intro copy** — 2–4 paragraphs, place-first voice. Lives in `collection.data.intro`. Renders inside `Container`.
4. **Photo carousel** — aggregates `photos` from each essay in `collection.data.essays[]`. **Round-robin** interleave: deal one frame from each essay in turn (`E1[0], E2[0], E3[0], E1[1], E2[1], …`). Same dealing logic the `/work` filmstrip already uses (see `index.astro:82–89`). Click → essay slug + frame index.
5. **Essay cards** — large, like FeaturedWork on the homepage. Each card: cover, title, location, frame count, deep link.
6. **Archive section** — collapsed-by-default, `<details>` containing the album cards (current `AlbumCard`).

### Carousel: new component

`src/components/CollectionCarousel.astro` — reuse the `.film-roll` look from `/work` or build a simpler horizontal-scroll. Hover/focus surfaces the parent essay's title. Click goes to `/work/[collection]/[essay]#frame-N`. Desktop hover/scroll only — mobile sheet treatment lands in Phase 5.

---

## Phase 3 — Work page dossier nesting

`src/pages/work/index.astro` already has the dossier infrastructure. Two changes:

### Data shape

Today: `stories[]` is flat — one row per essay (or one row per collection if no essays). Replace with:

```ts
type DossierNode = {
  collection: { id, title, num, lng, lat, year, description };
  essays: Array<{ slug, title, photoCount, coverUrl, ... }>;
};
```

Build one node per collection. Pin numbering = collection number (not essay number) — `01..N` for collections only. Essays inherit their parent's pin.

### UI

Replace the flat `.story-dossier__row` list with a two-level structure:

```html
<div class="dossier-collection" data-collection={id}>
  <button class="dossier-collection__row" aria-expanded="false">
    <span class="dossier__num">01</span>
    <span class="dossier__title">Morocco</span>
    <span class="dossier__meta">3 essays · 2025</span>
    <span class="dossier__caret">▾</span>
  </button>
  <div class="dossier-collection__essays" hidden>
    <a class="dossier-essay" href="/work/morocco/nomads-essay">…</a>
    <a class="dossier-essay" href="/work/morocco/ksar-essay">…</a>
    <a class="dossier-essay" href="/work/morocco/wise-essay">…</a>
  </div>
</div>
```

Click on the collection row: expand + the world map flies to the collection center (still on `/work`, no nav). Click on the collection title link or "Open region →" CTA: navigate to `/work/[collection]`. Click on an essay row: navigate straight to the essay.

### Filmstrip

Already pulls per-collection. Keep, but tie it to the *expanded* collection rather than the hovered pin. When a collection is expanded, the filmstrip filters to its photos.

---

## Phase 4 — Persistent map + true zoom (site-wide)

The biggest piece. Astro's `ClientRouter` is already mounted (`BaseLayout.astro:58`). One MapLibre instance lives across the entire site and animates between pages.

### Mount the map once at layout level

The persistent map mounts in `BaseLayout.astro` (or a thin wrapper inside it), tagged `transition:persist="world-map"`. Every page renders into the same shell; the map element survives every swap.

```astro
<!-- BaseLayout.astro -->
<div id="persistent-map-shell" transition:persist="world-map" data-map-shell>
  <Map ... />
</div>
<slot />
```

Markers and regions for **all** collections are added once at construction. Per-page state (target center/zoom, which markers are "active", which layout role the map plays) rides on data attributes the page renders.

### Per-page declaration

Each page declares its desired map state via a dataset on the page root:

```astro
<!-- /work/[collection]/index.astro -->
<main
  data-map-target-center={JSON.stringify([-6.9, 31.2])}
  data-map-target-zoom="7.8"
  data-map-target-active-collection="morocco"
  data-map-layout="region"
>
  ...
</main>
```

`data-map-layout` values:
- `world` — full-bleed hero (`/`, `/work`)
- `region` — full-bleed below header (`/work/[collection]`)
- `inset` — small inset slot (`/work/[collection]/[essay]` map slide)
- `hidden` — pages with no map (`/notes`, `/about`, `/gallery`)

After `astro:after-swap`, the map controller reads these attributes and:
1. Animates the shell's CSS positioning to match the new layout role (FLIP-style or simple class swap with transition).
2. Calls `map.flyTo({ center, zoom, duration: 1200, essential: true })`.
3. Toggles marker visibility based on the active collection.

### Layout-role transitions

The map element has to physically move and resize between roles. Two implementation paths:

- **Class-based (simpler):** the map shell has `position: fixed` with computed `top/left/width/height` per layout role. CSS transitions handle the morph. Each page emits its target rect as data; controller applies a class. Works well between full-bleed roles. Inset is the awkward case.
- **FLIP-based (more correct):** before swap, capture map rect. After swap, capture the new target slot's rect. Animate the persisted node from old → new with a transform. Slot in the new page is an empty placeholder element.

**Pick:** start with class-based for `world`/`region`/`hidden`. Defer `inset` (essay map slide) — keep essay map slides as their own separate Map instances for now. We can fold them in later.

### Marker visibility

DOM markers (today's implementation: `new maplibregl.Marker({ element })`) get a `data-collection` attribute on the element. On swap, iterate and set `display: none` / opacity by zoom + active collection. No marker destruction/recreation.

GeoJSON-source markers would be cleaner but require porting all current marker styling — out of scope for this refactor.

### Fallback

`prefers-reduced-motion: reduce` → skip the fly animation, snap to target. The map still persists; just no camera tween.

### Pages without a map

`/notes`, `/about`, `/gallery` declare `data-map-layout="hidden"`. The shell collapses (`opacity: 0`, `pointer-events: none`, `height: 0`) but the MapLibre instance stays alive. Returning to `/work` flies in.

---

## Phasing & PR order

| # | PR | Depends on | Risk |
|---|----|------------|------|
| 1 | **Migration script first**, then data lift. Build `scripts/lift-essay-photos.ts`, dry-run it, apply per-essay with snapshot tests proving photo order is preserved, then ship the `essays` content collection + reference list + `albums` → `archiveAlbums` rename. | — | Low if script is well-tested. The script *is* the deliverable; the data changes are its output. |
| 2 | Collection page rebuild: `.md` intro sidecar, round-robin carousel, essay cards, archive `<details>`. Desktop layout only. | 1 | Medium. New components, schema additions. Bake before ship. |
| 3 | Work dossier: collapsible collection rows with nested essays. Desktop only. | — (independent) | Low–medium. Pure UI on `/work`. |
| 4 | Persistent map + true zoom, **site-wide**. New BaseLayout mount, `data-map-layout` page declarations, class-based layout-role transitions, marker visibility toggling. | (best after 2) | High. Touches every page's layout, view transition lifecycle, marker rendering. |
| 5 | Mobile pass: dossier two-level sheet, collection page reflow, carousel touch behavior, persistent map mobile sizing. | 2, 3, 4 | Medium. Best done once the desktop shape is locked. |

Ship order: **1 → 2 → 3 → 4 → 5.** 1 is pure data and merges cleanly. 2 and 3 can ship independently after that (or even in parallel if the work splits cleanly). 4 lands last among desktop work because half-finished it breaks every page. 5 is the deferred mobile pass.

---

## Resolved decisions (formerly open questions)

1. **Intro copy source** → sidecar `.md` file per collection (`src/data/collections/<id>.md`).
2. **Persistent map scope** → site-wide. One MapLibre instance lives in `BaseLayout`, persists across every nav.
3. **Carousel order** → round-robin (deal one frame per essay in turn). Reuse the dealing logic already in `/work/index.astro:82–89`.
4. **Mobile dossier** → deferred to Phase 5. Desktop-first.
5. **Regional markers** → continue targeting essays directly. No change.

## Outstanding question

- **Home page map ↔ persistent map relationship**: home today renders its own world map (with the live-location marker, `Akershus, NOR`). When the persistent map goes site-wide, home's map *becomes* the persistent map. The live marker stays as a permanent layer, not tied to any page. Confirms that this refactor will touch the home page's hero too — call out before Phase 4 to make sure we're aligned on visual continuity from home.

---

## Out of scope for this refactor

- Redesigning the essay slide library
- New typography or color tokens

## Phase rollout (as built)

| Phase | PR | Status | Notes |
|---|---|---|---|
| 1 — Data lift | #49 | ✅ Shipped | `scripts/lift-essay-photos.ts` + new `essays` content collection + `albums` → `archiveAlbums` rename + 8 consumer files updated |
| 2 — Collection page rebuild | #50 | ✅ Shipped | Region page layout: header → map → carousel → essay cards → archive. Subsequent commits dropped the `.md` intro and switched to a single tagline (per design feedback) |
| 3 — Work dossier nesting | #51 | ✅ Shipped | Collapsible collection rows, nested essay anchors, year filter intact |
| 4a — Persistent map (work pages) | #52, #53 | ✅ Shipped | `PersistentMap.astro` + `persistent-map-init.ts` covering `/work` and `/work/[collection]`. Live marker + `interactive: false` restored in #53 |
| 4b — Persistent map across essays + dispatch | #54 | ✅ Shipped | Inset role, IntersectionObserver-driven scroll docking on `EssaySlideMapInset`. Patagonia briefing folded in |
| 4b part 2 — Home page hero | — | ⏸ Deferred | Held at user's request to spend more design time |
| 5 — Mobile pass | #55 | ✅ Shipped | Dossier sheet, carousel/inset reflow, presence-aware map fade. Plus a unification refactor (rAF rect tracker drives all layout roles, not just inset) |

## What changed vs. the plan

- **Intro markdown sidecar dropped.** Phase 2 originally added `src/data/collections/morocco.md` rendered above the map. After review the duplicate copy and weird placement read as "bad copypasta." We dropped the sidecar entirely; the collection page header is now a single-line tagline only. The `collectionIntros` content collection was added then removed in the same PR cycle — it's not in the schema today.
- **Persistent map scope: 4a + 4b, with 4b part 2 deferred.** The original plan called for site-wide persistence in one PR. The advisor split it: 4a for `/work` ↔ `/work/[collection]`, 4b for essays + dispatch. The home page hero (4b part 2) is held — it needs design work before code.
- **Class-based layout transitions → rAF rect tracker.** The plan called for class-based CSS positioning per layout role (`world` / `region` / `hidden`). Inset was supposed to be deferred. In practice, the inset slot needed scroll-aware position tracking (essay map slides aren't in fixed locations), so we built the rAF-based slot tracker for inset first. Then user feedback on the fixed/pinned feel of world/region prompted us to **unify everything around the rAF tracker** — every visible layout reads its rect from a slot's `getBoundingClientRect()` every frame. Static CSS positioning rules removed.
- **Lock behavior on /work scoped to desktop.** Mobile tap-to-lock-then-tap-essay-row felt like friction. Mobile clicks navigate directly; desktop world view keeps lock + dossier auto-expand.
- **Filmstrip ownership.** Briefly tried `position: fixed` on the filmstrip during Phase 5 to match the persistent map; reverted to `position: absolute` inside `.map-hero` once the rAF unification landed (the map now scrolls with `.map-hero`, so the filmstrip naturally goes with it).
- **Essay marker prefixing.** To avoid `num` collisions across collections in a single map instance, marker nums are prefixed (`world-NN`, `morocco-NN`). The visible badge uses a separate `displayNum` so it still reads "01".
- **Patagonia briefing was originally out of scope** — folded into 4b since it uses `EssaySlideMapInset` like the essays do, so it benefits from the same inset behavior for free.

## Lessons worth remembering

- Astro 5's glob loader treats a top-level `slug` field as the entry ID, overriding the filename. The schema deliberately omits `slug`.
- `regions-hatch` is added asynchronously in `map-init` after the crosshatch image loads; `setFilter` calls before `map.once('idle', …)` silently miss it.
- A `position: fixed` element with `width: 0; height: 0` lets MapLibre init at 0×0 and never recover. The persistent shell defaults to viewport-fill (`100vw × 100vh`) but stays invisible until the controller adds `.is-ready`.
- `astro check` OOMs on a stale `dist/`. Always `rm -rf dist .astro node_modules/.astro` before debugging build failures.
- `transition:persist` keeps the DOM element across page swaps. The map's MapLibre instance + canvas + tile cache survive, so `flyTo` on `astro:after-swap` is what actually animates the camera between pages.
