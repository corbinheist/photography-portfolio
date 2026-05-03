# Photography Portfolio

A minimalist, image-first photography portfolio built with [Astro](https://astro.build). Smooth scroll animations, responsive image delivery via DigitalOcean Spaces CDN, snap-scroll photo essays, interactive MapLibre GL maps, and Substack integration for blog content.

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Astro 5 (static output) |
| Styling | Vanilla CSS + Custom Properties |
| Typography | Vollkorn (headings), IBM Plex Sans (body), IBM Plex Mono (code) — Google Fonts |
| Animations | GSAP + Lenis |
| Image Storage | DigitalOcean Spaces (S3-compatible CDN) |
| Image Processing | Sharp (offline scripts) |
| Maps | MapLibre GL + MapTiler |
| Content | Astro Content Collections (YAML + Zod schemas) |
| Blog | Substack RSS feed, parsed at build time |
| Testing | Vitest (unit) + Playwright (e2e) |
| Server | Nginx on a DO Droplet |
| CI/CD | GitHub Actions → SCP to droplet |
| Package Manager | pnpm |

## Getting Started

```sh
# Install dependencies
pnpm install

# Start dev server (http://localhost:4321)
pnpm dev

# Type-check and build for production
pnpm build

# Preview the production build locally
pnpm preview
```

### Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```sh
cp .env.example .env
```

| Variable | Purpose |
|---|---|
| `DO_SPACES_KEY` | DigitalOcean Spaces access key |
| `DO_SPACES_SECRET` | DigitalOcean Spaces secret key |
| `DO_SPACES_BUCKET` | Bucket name |
| `DO_SPACES_REGION` | Region (default: `nyc3`) |
| `DO_SPACES_CDN_ENDPOINT` | CDN URL for the bucket |
| `SUBSTACK_RSS_URL` | Your Substack RSS feed URL |
| `SITE_URL` | Production site URL |
| `PUBLIC_MAPTILER_KEY` | MapTiler API key for map tiles |

### Fonts

Fonts are loaded via Google Fonts in `BaseLayout.astro` — no local files needed. The stack is Vollkorn (display/headings), IBM Plex Sans (body text), and IBM Plex Mono (code/UI labels).

## Content Architecture

The site is **geocentric**: collections represent regions of the world, and essays are the canonical content unit within a region. Albums survive as a legacy archive on each collection page.

```
Collection (region)            e.g. "Morocco"
   ├── Essay (story)               "The Bougmez Underfoot"
   │     └── Photos[]              ordered photo manifest
   ├── Essay …
   └── archiveAlbums[]              legacy album refs (collapsed by default)

Photos (atomic) ── referenced by essays + albums
Settings (site-wide)
```

Each piece is a YAML file under `src/data/`, validated by Zod schemas in `src/content.config.ts`. The relevant content collections are:

| Collection | Source | What it carries |
|---|---|---|
| `photos` | `src/data/photos/*.yaml` | A single photo: CDN url, dimensions, lqip, EXIF, tags |
| `albums` | `src/data/albums/*.yaml` | A flat ordered list of photo IDs (legacy unit; archive only) |
| `essays` | `src/data/essays/*.yaml` | An essay's full photo manifest, ordered, with optional EXIF per frame |
| `photoCollections` | `src/data/collections/*.yaml` | A region: title, intro, map config, list of essay IDs, archive album IDs |
| `settings` | `src/data/settings.yaml` | Site-wide config |
| `blog` | Substack RSS (custom loader) | Notes / journal posts |

Essay entries are referenced from collections by ID (e.g. `morocco-wise-essay`) — the filename is the source of truth, not a `slug` field.

### Photos (`src/data/photos/*.yaml`)

```yaml
title: Northern Lights Over Kirkjufell
url: https://your-bucket.nyc3.cdn.digitaloceanspaces.com/photos/iceland-001
width: 2400
height: 1600
lqip: data:image/webp;base64,... # ~400 byte blur placeholder
exif:
  camera: Sony A7IV
  lens: Sony 24-70mm f/2.8 GM II
  focalLength: 24mm
  aperture: f/2.8
  shutter: 15s
  iso: 3200
  date: "2024-09-15"
tags: [landscape, aurora, iceland]
sortOrder: 1
```

### Albums (`src/data/albums/*.yaml`)

Albums are the legacy unit. They still exist for galleries that haven't been turned into essays. On collection pages they show in a collapsed `<details>` archive section.

```yaml
title: Iceland 2024
description: Southern Iceland — northern lights, black sand, glaciers.
coverPhoto: iceland-001          # references a photo ID
photos:                           # ordered list of photo IDs
  - iceland-001
  - iceland-002
date: "2024-09"
location: Iceland
layout: masonry                   # masonry | grid | horizontal-scroll
draft: false
sortOrder: 1
```

### Essays (`src/data/essays/<collection>-<slug>.yaml`)

The canonical "supercharged album" — a full photo manifest with optional per-frame EXIF, plus essay-level metadata. Each essay's `.astro` page reads its photos via `getEntry('essays', '<id>')`.

```yaml
collectionId: morocco
title: The Bougmez Underfoot
description: One day in Morocco's High Atlas — gorge, pass, and darkness.
coverPhotoIndex: 0                # which photo is the cover
photos:
  - url: https://cdn.example.com/photos/heist-wise-essay-027-cnh_4995
    width: 8192
    height: 5464
    lqip: data:image/webp;base64,…
    title: Into the Gorge
    exif:                         # optional
      camera: Canon R5m2
      lens: RF 50mm f/1.2
      iso: 400
  - …
```

The migration script that lifts inline `const photos = [...]` arrays from essay `.astro` files into these YAMLs lives at `scripts/lift-essay-photos.ts` (default `--dry-run`; pass `--write` to apply).

### Collections (`src/data/collections/*.yaml`)

```yaml
title: Morocco
description: Nomad camps, trail running, and the terrain between the Atlas and the Sahara.
archiveAlbums:                    # legacy albums shown in the archive <details>
  - morocco
essays:                            # ordered essay entry IDs
  - morocco-nomads-essay
  - morocco-ksar-essay
  - morocco-wise-essay
coverPhoto: morocco-001
sortOrder: 8
map:                               # optional regional map
  center: [-6.9, 31.2]            # [lng, lat]
  zoom: 7.8
  regionsFile: morocco-regions.json
  routeFile: morocco-route.json
  markers:
    - label: Aït Bougmez Valley
      lng: -6.30
      lat: 31.62
      num: "06"
      target: /work/morocco/wise-essay
```

Markers carry a `target` URL — clicking them navigates straight to the essay (or album) they represent. The collection page filters carousel frames by which marker's region the user is hovering, so each region polygon "owns" a set of frames.

### Site Settings (`src/data/settings.yaml`)

Site name, author info, Substack URL, and social links.

## Page Layouts

### ProjectLayout (albums + essays)

`ProjectLayout` is the shared wrapper for album pages and photo essays under `/work/`. It provides the SideRail navigation and CommandPalette on every project page. Essays opt into snap-scroll behavior via props:

- `snap` — enables `scroll-snap-type: y mandatory`, loads `essay.css`, activates keyboard navigation and nav dots
- `progress` — shows a scroll progress bar at the top

Albums use `ProjectLayout` with no props (no snap, no progress). The side rail defaults to collapsed (52px) on project pages.

### PageLayout (standard pages)

`PageLayout` wraps standard pages (gallery, work index, about, blog) with Header, Footer, and SubscribeBanner.

### PitchLayout (client decks)

Specialized layouts for client pitch presentations under `/pitch/`. Variants include `JapanPitchLayout`, `KormanPitchLayout`, and `ArchivePitchLayout` for project-specific styling.

### Homepage

The landing page uses a briefing/dossier design language:

| Component | Purpose |
|---|---|
| `HeroBriefing` | Full-viewport slideshow with dossier-style metadata overlays |
| `DispatchCallout` | Featured collection callout with cover image + coordinates |
| `ManifestSection` | Numbered list of all collections with status, coordinates, and frame counts |
| `EssaysPreview` | Latest photo essays as a numbered list |
| `ColophonTeaser` | About/colophon section teaser |

### `/work` — region dossier

`/work/index.astro` is the world view. Right-hand panel lists all regions; each row is a collapsible button (`.dossier-collection`) that expands to show its essays nested underneath. The world map shows one numbered marker per region. On mobile the dossier panel becomes a bottom sheet (`.story-sheet`); tapping a region opens a sheet with its essays.

### `/work/[collection]` — region page

A real region page. Top-down: breadcrumb + title + tagline → regional map → photo carousel (round-robin frames from every linked essay, with sprocket-perforated film-roll styling) → essay cards (`EssayCard`) → `<details>` archive of legacy albums. The carousel's frame highlight is wired to map-marker hover via a `MutationObserver` on `.map-marker--active`, so hovering "Aït Bougmez Valley" (a marker that targets wise-essay) lights up the wise-essay frames in the strip.

### Navigation: SideRail + CommandPalette

The **SideRail** is a fixed vertical nav bar with the HEIST.STUDIO wordmark, numbered section links, search trigger, and theme toggle. It collapses to a 52px icon strip and expands to 180px. State persists in `localStorage` (`rail-collapsed`). Hidden on mobile (< 1024px).

The **CommandPalette** opens with `/` and provides fuzzy-match navigation to any page. Tab to accept completions, arrow keys to cycle matches, Enter to navigate.

### Gallery Layouts

Each album chooses its display style via the `layout` field:

- **`masonry`** (default) — Pinterest-style columns, photos keep their natural aspect ratios
- **`grid`** — Uniform aspect ratio grid (configurable via `gridAspectRatio`, e.g. `"3:2"`)
- **`horizontal-scroll`** — Cinematic horizontal strip, one photo at a time, driven by GSAP ScrollTrigger pin + scrub

## Photo Essays

Full-viewport, snap-scroll photo essays live alongside album pages under `/work/`. Each essay is a sequence of slide components:

| Component | Purpose |
|---|---|
| `EssaySlideFullBleed` | Full-viewport image (cover or contain with blurred backdrop) |
| `EssaySlideImageText` | 55/45 image-text split (`flip` reverses to 45/55) |
| `EssaySlideDiptych` | Two images side-by-side (landscape or portrait) |
| `EssaySlideTriptych` | Three images side-by-side |
| `EssaySlideMiniGallery` | Masonry grid within a single slide |
| `EssaySlideText` | Text-only slide (centered or left-aligned) |
| `EssaySlideQuote` | Pull-quote slide |
| `EssaySlideColophon` | Closing credits/colophon slide |
| `EssaySlideFlow` | Prose section for longer narrative passages |
| `EssaySequence` | Orientation-adaptive wrapper (landscape vs portrait sequences) |
| `EssayPlaceholder` | Placeholder for essays under construction |

All slide styles are in `src/styles/essay.css`. Navigation (arrow keys, nav dots, progress bar) is handled by `src/scripts/essay-nav.ts`.

See `/essays/example` for a kitchen-sink demo of every slide type.

## Image Pipeline

Process raw photos into responsive, CDN-ready variants:

```sh
# 1. Drop photos into _raw/

# 2. Generate responsive variants (640–2400px in WebP + AVIF) and LQIP placeholders
pnpm process-images

# 3. Upload to DigitalOcean Spaces (skips already-uploaded files)
pnpm upload-images

# 4. Generate YAML content files with EXIF data (won't overwrite existing files)
pnpm generate-yaml
```

The pipeline produces:
- 5 responsive widths (640, 750, 1080, 1600, 2400) in WebP and AVIF
- A 20px-wide base64 LQIP blur placeholder per photo (~400 bytes)
- EXIF metadata extraction (camera, lens, settings, date)

When a source image's native width falls between standard breakpoints (e.g. 2048px), the pipeline generates an additional variant at native width so the srcset covers every resolution without upscaling.

The `<Photo />` component renders a `<picture>` element with AVIF/WebP `srcset` and the LQIP as a CSS background for instant blur-up.

## Maps

The site has **one persistent MapLibre instance** that lives in `BaseLayout` and survives every page swap via `transition:persist="map"`. Pages don't mount their own map — they declare a layout role + target camera state, and the persistent shell does the rest.

### Layout roles

`<body data-map-layout>` selects a role per page:

| Role | When | What it shows |
|---|---|---|
| `world` | `/work` | World view, all regions' country polygons + numbered markers |
| `region` | `/work/[collection]` | Zoomed to that region's center; only its sub-region polygons + markers |
| `inset` | Active essay map slide (`EssaySlideMapInset`) | Smaller rect sized to the slide; flies further into the essay's specific zoom |
| `hidden` | Everywhere else (`/about`, `/blog`, etc.) | Map shell collapsed; instance stays alive |

### Slot-driven positioning

The persistent map is `position: fixed`, but its rect is JS-driven, not CSS-driven. Pages mark a slot element with `data-map-presence-anchor` (`/work` uses `.map-hero__map`, `/work/[collection]` uses `.map-section--persistent`). A `requestAnimationFrame` loop in `persistent-map-init.ts` reads the slot's `getBoundingClientRect()` every frame and writes the result into `--map-shell-{top,left,width,height}` on `<body>`, so the map *appears* to scroll with the page even though it's fixed-positioned. Essay map slides take over the slot via an `IntersectionObserver` on `[data-map-inset-slot]`.

### Markers + regions

`PersistentMap.astro` SSR-aggregates **all** collection markers + region polygons from every collection YAML and the matching `*-country.json` / `*-regions.json` files in `src/data/maps/`. Each entity is tagged with `view` (`world` | `region`) and `collectionId`; the runtime controller filters by current layout role:

- **Region polygons** — `map.setFilter('regions-fill', ['all', ['==', ['get', 'view'], 'region'], ['==', ['get', 'collectionId'], '<id>']])` etc. Re-applied on `map.once('idle', …)` so the asynchronously-added `regions-hatch` layer doesn't slip through unfiltered.
- **DOM markers** — toggle a `.map-marker--inactive` class per marker based on view + active collection.

Marker `num` is globally unique (`world-01`, `morocco-01`, …) so highlight wiring across collections doesn't collide; a separate `displayNum` keeps the visible badge clean (`01`).

### Camera

`map.flyTo({ center, zoom, duration: 1200, essential: true })` animates the camera on every page swap. `prefers-reduced-motion: reduce` substitutes `jumpTo`. The persistent map is `interactive: false` — the camera is app-controlled; users can't scroll-zoom away from the declared view.

### Click behavior

- **Desktop `/work`**: clicking a marker / region locks the map (highlight + auto-expand the matching dossier row).
- **Desktop region / inset / hidden**: clicking navigates directly to the marker's `target`.
- **Mobile (anywhere)**: clicking always navigates. No lock.

### Files

- `src/components/PersistentMap.astro` — SSR aggregation + the `<div transition:persist="map">` shell
- `src/scripts/persistent-map-init.ts` — runtime controller (rect tracking, camera, filtering, observers)
- `src/scripts/map-init.ts` — generic MapLibre setup (still used for any page that mounts a `<Map>` directly; exposes `__map`, `__setLocked`, `__setHovered` on its container so external scripts can drive the map)
- `src/components/Map.astro` — the reusable Map component the persistent shell wraps
- `src/data/maps/*.json` — per-collection region polygons and routes

## Animation System

- **Lenis** — smooth scroll normalization
- **GSAP ScrollTrigger** — scroll-driven animations:
  - `.reveal` — fade up + translate on scroll
  - `.fade-in` — opacity fade on scroll
  - `.mask-reveal` — clip-path expanding on scroll
  - `.stagger-children` — sequential child animation
  - `.parallax-wrap` — subtle vertical parallax on images
- **Horizontal scroll galleries** — GSAP pin + scrub for `horizontal-scroll` layout albums
- **Hover micro-interactions** — subtle scale on gallery items
- **Astro Client Router** — page transitions with proper animation teardown (`astro:after-swap`) and re-initialization (`astro:page-load`)
- **Reduced motion** — all animations are skipped when `prefers-reduced-motion: reduce` is set

## Theme

Dark theme by default with a light theme toggle. The active theme persists in `localStorage`. Inline scripts in `<head>` set both the theme and the side rail width before first paint to prevent flash.

CSS custom properties drive the entire color system — no accent color. The photography provides all the color.

## Project Structure

```
photography-portfolio/
├── .github/workflows/
│   └── deploy.yml              # GitHub Actions CI/CD (build + test + deploy)
├── public/
│   ├── favicon.svg
│   ├── robots.txt
│   ├── fonts/                  # Local font files (if any)
│   ├── images/                 # Static images (pitch deck assets)
│   └── scripts/                # Third-party scripts (analytics)
├── scripts/                    # Node.js image pipeline scripts
│   ├── process-images.ts       # Sharp resize + format conversion + LQIP
│   ├── upload-to-spaces.ts     # S3 upload to DO Spaces
│   ├── generate-photo-yaml.ts  # EXIF extraction + YAML generation
│   ├── fetch-rss.ts            # Substack RSS feed fetcher
│   └── preview.ts              # Local preview server management
├── tests/
│   ├── e2e/                    # Playwright e2e tests (smoke, lightbox, theme)
│   └── unit/                   # Vitest unit tests (lightbox, theme, RSS, subscribe, photo-widths)
├── src/
│   ├── components/
│   │   ├── blog/               # BlogCard, BlogSection
│   │   ├── brand/              # HeistMask (wordmark/branding)
│   │   ├── essay/              # EssaySlide* components, EssaySequence, EssayPlaceholder
│   │   ├── global/             # Header, Footer, SideRail, CommandPalette, ThemeToggle, SEO, SubscribeForm, SubscribeBanner
│   │   ├── home/               # HeroBriefing, DispatchCallout, ManifestSection, EssaysPreview, ColophonTeaser, etc.
│   │   ├── photo/              # Photo, PhotoGrid, AlbumCard, EssayCard, PhotoLightbox
│   │   ├── ui/                 # Button, Container
│   │   ├── CollectionCarousel.astro  # Round-robin film-roll on /work/[collection]
│   │   ├── PersistentMap.astro       # SSR-aggregated persistent map shell
│   │   └── Map.astro                 # Reusable MapLibre GL map component
│   ├── content.config.ts       # Zod schemas for all content collections
│   ├── data/
│   │   ├── albums/             # Album YAML files (legacy unit; archive only)
│   │   ├── collections/        # Region YAML files (essays + archiveAlbums)
│   │   ├── essays/             # Per-essay photo manifests
│   │   ├── maps/               # GeoJSON: country polygons, sub-region polygons, routes
│   │   ├── loaders/
│   │   │   └── substack-loader.ts
│   │   ├── photos/             # Photo YAML files
│   │   ├── settings.yaml       # Site configuration
│   │   └── substack-feed.xml   # Cached RSS feed (committed to repo)
│   ├── layouts/
│   │   ├── BaseLayout.astro    # HTML shell, ClientRouter, fonts, theme, rail-width flash prevention
│   │   ├── ProjectLayout.astro # Albums + essays: SideRail, CommandPalette, optional snap-scroll
│   │   ├── PageLayout.astro    # Standard pages: Header, Footer, SubscribeBanner
│   │   ├── PitchLayout.astro   # Client pitch decks
│   │   ├── JapanPitchLayout.astro
│   │   ├── KormanPitchLayout.astro
│   │   └── ArchivePitchLayout.astro
│   ├── pages/
│   │   ├── index.astro
│   │   ├── gallery.astro               # All photos (masonry grid + lightbox)
│   │   ├── work/
│   │   │   ├── index.astro             # All collections
│   │   │   ├── morocco/
│   │   │   │   ├── nomads-essay.astro  # Photo essay: Nomads of Djebel Saghro
│   │   │   │   └── ksar-essay.astro    # Photo essay: Ksar Tamnougalt
│   │   │   └── [collection]/
│   │   │       ├── index.astro         # Albums in a collection (+ map if configured)
│   │   │       └── [album].astro       # Single album gallery
│   │   ├── essays/
│   │   │   └── example.astro           # Kitchen-sink essay slide demo
│   │   ├── pitch/                      # Client pitch decks
│   │   ├── about.astro
│   │   ├── blog.astro
│   │   └── 404.astro
│   ├── scripts/
│   │   ├── animations/         # init.ts, reveals.ts, parallax.ts, gallery.ts
│   │   ├── utils/              # photo-widths.ts
│   │   ├── essay-nav.ts        # Essay keyboard nav, progress bar, nav dots
│   │   ├── lightbox.ts         # Fullscreen photo viewer logic
│   │   ├── map-init.ts         # MapLibre GL map initialization
│   │   ├── persistent-map-init.ts # Persistent-map runtime: rect tracker,
│   │   │                          # camera, region/marker filters, observers
│   │   ├── work-map-interaction.ts # Region dossier coordinator on /work
│   │   ├── subscribe.ts        # Email subscribe form logic
│   │   └── theme.ts            # Dark/light mode persistence
│   └── styles/
│       ├── global.css          # Reset, custom properties, typography
│       ├── fonts.css           # Font-stack declarations (Google Fonts loaded in BaseLayout)
│       ├── essay.css           # Snap-scroll essay slide layouts + responsive rules
│       ├── animations.css      # Animation initial states + reduced motion
│       ├── map.css             # MapLibre GL map styling
│       └── pitch.css           # Pitch deck base styles (+ per-deck variants)
├── _raw/                       # Drop raw photos here (gitignored)
├── vitest.config.ts
├── playwright.config.ts
├── astro.config.mjs
├── tsconfig.json
└── package.json
```

## Testing

```sh
# Run unit tests (vitest)
pnpm test

# Run unit tests in watch mode
pnpm test:watch

# Run e2e tests (playwright — requires a build first)
pnpm test:e2e

# Run all tests
pnpm test:all
```

Unit tests cover lightbox logic, theme persistence, RSS parsing, subscribe forms, and photo width utilities. E2E tests cover smoke navigation, lightbox interaction, and theme toggling.

## Deployment

### Nginx

The site is served by Nginx on the droplet. The config lives at `/etc/nginx/sites-available/portfolio`:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    root /var/www/portfolio;
    index index.html;

    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;
    gzip_min_length 256;

    location ~* \.(css|js|woff2|avif|webp|jpg|png|svg|ico)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location ~* \.html$ {
        expires 1h;
        add_header Cache-Control "public, must-revalidate";
    }

    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;
    add_header Referrer-Policy strict-origin-when-cross-origin;

    location / {
        try_files $uri $uri/ $uri.html =404;
    }

    error_page 404 /404.html;
}
```

Enable with `ln -s /etc/nginx/sites-available/portfolio /etc/nginx/sites-enabled/` and add HTTPS via `certbot --nginx -d yourdomain.com`.

### GitHub Actions

The workflow at `.github/workflows/deploy.yml` runs on every push to `main`:

1. Installs dependencies with pnpm
2. Runs unit tests (`pnpm test`)
3. Attempts to fetch fresh Substack RSS (falls back to cached file if blocked)
4. Runs `astro check` (type checking) and `astro build`
5. Installs Playwright and runs e2e tests against the build
6. SCPs the `dist/` directory to the droplet
7. Reloads Nginx

The build and deploy jobs are separated — deploy only runs on `main` and requires the build to pass.

Required GitHub repository secrets:

| Secret | Value |
|---|---|
| `DROPLET_HOST` | Droplet IP or hostname |
| `DROPLET_USER` | SSH username (e.g. `deploy`) |
| `DROPLET_SSH_KEY` | Private SSH key for the deploy user |
| `SUBSTACK_RSS_URL` | Substack RSS feed URL (optional) |
| `SITE_URL` | Production URL |
| `PUBLIC_MAPTILER_KEY` | MapTiler API key for map tiles |

The workflow also triggers on `repository_dispatch` events of type `substack-update` and on manual `workflow_dispatch`.

### Updating Blog Posts

Substack blocks RSS requests from cloud CI runners. The workflow attempts to fetch fresh content but falls back to a cached feed file committed to the repo. To update blog posts:

```sh
# Fetch the latest RSS feed locally
pnpm fetch-rss

# Commit the updated cache and push — triggers a deploy
git add src/data/substack-feed.xml
git commit -m "Update Substack feed"
git push
```

This can also be scripted as a cron job or triggered after publishing a new Substack post.

### Droplet Setup (Quick Reference)

```sh
# Create deploy user
adduser --disabled-password --gecos "" deploy
mkdir -p /var/www/portfolio/dist
chown -R deploy:deploy /var/www/portfolio

# Allow deploy user to reload nginx
echo "deploy ALL=(ALL) NOPASSWD: /usr/bin/systemctl reload nginx" >> /etc/sudoers.d/deploy
chmod 440 /etc/sudoers.d/deploy

# Generate deploy key (as deploy user)
su - deploy
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/deploy_key -N ""
cat ~/.ssh/deploy_key.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
cat ~/.ssh/deploy_key  # copy this into DROPLET_SSH_KEY secret
exit

# Set up nginx site (as root)
# paste config above into /etc/nginx/sites-available/portfolio
ln -s /etc/nginx/sites-available/portfolio /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# HTTPS
certbot --nginx -d yourdomain.com
```

## Adding Content

### New Photo

1. Place the raw image in `_raw/`
2. Run the pipeline: `pnpm process-images && pnpm upload-images && pnpm generate-yaml`
3. Edit the generated YAML in `src/data/photos/` to customize the title and tags

### New Album

Create a YAML file in `src/data/albums/`:

```yaml
title: My New Album
description: A short description.
coverPhoto: photo-id        # must match a photo filename (without .yaml)
photos:
  - photo-id-1
  - photo-id-2
location: Somewhere
date: "2025-01"
layout: masonry
sortOrder: 1
```

Then add the album ID to a collection's `albums` list in `src/data/collections/`.

### New Essay

An essay is a `.astro` page under `src/pages/work/<collection>/<slug>.astro` plus a YAML photo manifest at `src/data/essays/<collection>-<slug>.yaml`. The fastest path is to author the essay's slide composition inline in the `.astro` (using `EssaySlideHero`, `EssaySlideMapInset`, etc.) and lift the photo array via the migration script:

```sh
# 1. Drop a `const photos = [{...}, …]` array at the top of the .astro,
#    referencing CDN URLs, dimensions, and lqip blobs.
# 2. Add the essay's metadata (title, description) to the parent
#    collection YAML's `essays:` reference list — but for the lift script
#    to pick up title/description, just add a temporary blob first:
#
#    essays:
#      - slug: my-new-essay
#        title: My New Essay
#        description: …

# 3. Run the lifter (default --dry-run)
pnpm tsx scripts/lift-essay-photos.ts --essay=my-new-essay
pnpm tsx scripts/lift-essay-photos.ts --essay=my-new-essay --print  # show YAML
pnpm tsx scripts/lift-essay-photos.ts --essay=my-new-essay --write  # apply

# 4. The lifter rewrites the .astro to read photos from the content
#    collection (`getEntry('essays', 'morocco-my-new-essay')`).
```

Once lifted, the essay is referenced from the collection by its content-collection ID (filename without extension), e.g. `morocco-my-new-essay`.

### New Collection

Create a YAML file in `src/data/collections/`:

```yaml
title: My Collection
description: Region tagline.
archiveAlbums:                   # legacy albums (optional)
  - album-id
essays:                          # essay entry IDs (filename stems)
  - mycollection-essay-one
coverPhoto: photo-id
sortOrder: 1
map:                             # optional regional map
  center: [-8.0, 31.6]
  zoom: 6
  regionsFile: my-regions.json   # place in src/data/maps/
  routeFile: my-route.json
  markers:
    - label: Marrakech
      lng: -8.0
      lat: 31.63
      num: "01"
      target: /work/my-collection/some-essay
```

The new collection automatically appears at `/work/` (in the dossier panel) and at `/work/[collection-id]/`. If a `map` is configured, the persistent map flies to its center on navigation.
