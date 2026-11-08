# heist.studio

The photography portfolio of Corbin Heist: documentary stories, each one an MDX file. Astro 5, static output, served by nginx on a DigitalOcean droplet. Images are on DigitalOcean Spaces behind its CDN.

## Quick start

```sh
pnpm install
pnpm dev            # http://localhost:4321 (the site; the decks are a separate project)
pnpm dev:decks      # the pitch decks at /pitch/
pnpm build          # validate content, type check, build the site and the decks, check the bundle budget
pnpm exec vitest run
pnpm test:e2e       # build, then Playwright (uses the system Chrome when present)
```

Node version: `.nvmrc`. Package manager: pnpm (see `packageManager` in `package.json`).

## What the site is

| Route | Source | What it shows |
| -- | -- | -- |
| `/` | `src/pages/index.astro` | The newest story as a full-bleed title card, then the numbered story index |
| `/work/<slug>/` | `src/pages/work/[story].astro` + `src/content/stories/<slug>.mdx` | One story |
| `/gallery/` | `src/pages/gallery.astro` | Every frame of every story (each links to its place in the story), plus the gallery-only photographs |
| `/about/` | `src/pages/about.astro` | About, the ledger of stories, correspondence, commissions |
| `/pitch/*` | `decks/` (separate Astro project) | Client and brand decks, `noindex` |

Old URLs (`/work/morocco/nomads-essay/`, `/work/<region>`, `/blog`, …) redirect through `redirects` in `astro.config.mjs`.

**Navigation** (`src/components/global/SiteNav.astro`): on desktop, a semi-transparent left rail that lists the stories; the visitor can minimise it into a top bar (the choice is stored in `localStorage`). Phones and tablets always use the top bar. A new story appears in the navigation, the homepage, the gallery, and the About ledger without any code change.

**Tiers:** featured stories (the default) lead the homepage, are numbered in the order they were made (the oldest is № 01, the newest has the highest number; they list newest first), and form the rail's main list. Stories with `featured: false` list under "More stories" in the rail and on the homepage, are not numbered, and link previous/next only within their own tier.

**Order:** newest first by the story `date`. A day-precise date (`"2025-11-12"`) sorts above the same month (`"2025-11"`). `order` breaks ties.

## Publishing a story

A story is two files: `src/content/stories/<slug>.mdx` and its photo manifest `src/data/story-photos/<slug>.yaml`. The slug is the URL: `/work/<slug>/`.

1. Put the originals in `_raw/<slug>/` (not committed).
2. Run `pnpm photos <slug>`. It makes the AVIF and WebP variants and the LQIP placeholders, uploads them to Spaces (it skips files that are already there), and writes or updates the manifest. A re-run keeps hand-written fields (alt text, titles) and the order, adds new images at the end, and never deletes an entry. `--dry-run` writes and uploads nothing and prints the diff; `--no-upload` skips the upload.
3. Write the alt text in the manifest. `pnpm build` fails on an empty alt.
4. Write the MDX file:

```mdx
---
title: Cold Hands
place: Cerro Guido, Chile
region: Patagonia                      # optional
coordinates: { latitude: -50.917, longitude: -72.4 }   # optional; shown as 50°55′S 72°24′W
elevation_m: 1060                      # optional
date: "2026-04"                        # "YYYY", "YYYY-MM", or "YYYY-MM-DD"
summary: The headline text under the title.
cover: <image id>                      # the title-card photograph
order: 4                               # tiebreak only
client: URTH                           # optional; shows as a commission
credits:                               # optional
  - { role: Featuring, name: Alex Strohl }
featured: true                         # false: listed under "More stories", unnumbered, never the homepage hero
draft: false
---

## A chapter title

Prose is plain Markdown.

<Image id="<image id>" caption="Optional caption" />
<Image id="<image id>" size="full" />      <!-- full | wide (default for landscape) | inset (default for portrait) -->
<Image id="<image id>" exif />             <!-- appends camera and settings from the manifest EXIF -->
<Pair ids={["<id>", "<id>"]} captions={["", ""]} />
<Quote cite="Who said it">The quote.</Quote>
```

Each `##` heading is a chapter: it appears in the title card and in the sticky story bar. Frame numbers, the frame count, the kit (from EXIF), the story number, and the previous and next stories are computed; nothing is typed by hand. The cover is frame 01 unless the body shows it again.

**The rule for copy:** every label and caption is backed by a measurement, a date, a name, or a photograph. If a fact cannot be confirmed, leave it out.

`pnpm validate:content` checks every story: the manifest exists and parses, every image id exists, every image has alt text, the cover exists, the slug is kebab-case, no story sets a `url`, and no story URL is also a redirect source.

Drafts (`draft: true`) build only with `STORIES_INCLUDE_DRAFTS=1`.

**Gallery-only photographs:** a photograph that belongs to no story but should stay in the gallery goes in `src/data/gallery-extras.yaml`, with the same fields as a story manifest entry plus `place` and a quoted `date` (from EXIF). It sorts by date among the stories and is not a link.

## Everyday page

`/everyday/` shows the photographs in the Apple Photos album **EDC**, newest first. The photographs come from the iPhone and the Ricoh GR IIIx through the camera roll. A job on the Mac publishes them. Linear: project "heist.studio Everyday Gallery" (STU-80 to STU-82).

To publish a photograph: add it to the album EDC and give it a caption in Photos ("Add a Caption"). The caption is the alt text. The next sync (once an hour) publishes it.

- A photograph without a caption stays off the page. The sync log lists it until it has a caption.
- A photograph removed from the album leaves the page on the next sync. Its CDN objects stay.
- The coordinates are rounded to 2 decimal places (about 1.1 km) before they leave the Mac. The published AVIF and WebP files carry no EXIF (`tests/unit/everyday.test.ts` checks this).
- An edit in Photos gives the frame a new id, so the CDN never serves the old version.
- Videos are skipped. A Live Photo publishes its still image.
- `src/data/everyday.yaml` is written by the sync. Do not edit it by hand.

`pnpm everyday sync --dry-run` shows what a sync would do and writes nothing. `pnpm everyday sync` uploads and writes the manifest. `--publish` also validates the content, commits the manifest to `main`, and pushes, so CI deploys. Only the sync commits to `main` directly; code changes still go through a PR.

### Install the scheduled job (once)

```sh
git worktree add ~/.local/share/worktrees/photography-portfolio/everyday-sync main
cd ~/.local/share/worktrees/photography-portfolio/everyday-sync
cp ~/git/photography-portfolio/.env .     # the DigitalOcean Spaces keys and DO_SPACES_CDN_ENDPOINT
pnpm install
pnpm everyday sync --dry-run              # the first run asks for access to Photos
cp deploy/com.corbin.heist-everyday-sync.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.corbin.heist-everyday-sync.plist
launchctl kickstart gui/$(id -u)/com.corbin.heist-everyday-sync
tail -f ~/Library/Logs/heist-everyday-sync.log
```

The job runs `deploy/everyday-sync.sh`: it resets the worktree to `origin/main`, installs, and runs `pnpm everyday sync --publish`. It needs read access to the Photos library, and Automation access to Photos to download originals that are only in iCloud. If the log shows a permission error, grant those to the process it names in System Settings, Privacy and Security.

## Project structure

```
src/
  components/global/   SiteNav, Footer, SEO
  components/story/    StoryHero (title card, also the homepage hero), Image, Pair, Quote
  components/photo/    Photo (responsive AVIF/WebP srcset with LQIP)
  content/stories/     one MDX file per story
  data/story-photos/   one photo manifest per story
  data/settings.yaml   name, Substack URL, social links
  data/everyday.yaml   the Everyday frames (written by the sync)
  layouts/             SiteLayout (page frame), StoryLayout (story page)
  pages/               index, gallery, everyday, about, 404, work/[story]
  scripts/story-nav.ts frame counter, chapter, progress, J/K keys
  scripts/utils/       photo-widths, story-manifest (loader, ordering, frames, coordinates), everyday
  styles/              global.css (tokens), story.css
deploy/                the Everyday sync job (script and launchd agent)
decks/                 the pitch decks, a separate Astro project built into dist/pitch/
scripts/               photos, everyday (and everyday/export_album.py), process-images, upload-to-spaces, validate-content, check-build-budget, preview
tests/unit/            vitest
tests/e2e/             Playwright: smoke, accessibility (axe), publishing
```

## Design

- Tokens in `src/styles/global.css`: Flexoki base (`#100F0F`, `#FFFCF0`), heist greens (`--hs-moss #5CC37E` in dark, `--hs-bottle` in light), warm accents. The site follows the visitor's system light or dark setting (CSS `prefers-color-scheme`, no script). Text and scrims set on a photograph stay paper-on-dark in both themes.
- Type: Vollkorn (titles), IBM Plex Sans (prose), IBM Plex Mono (labels, counts, facts).
- Motion: CSS only, except `story-nav.ts` and the rail toggle. Cross-document view transitions; `prefers-reduced-motion` turns motion off.
- The site ships no JavaScript on most pages. `pnpm check:bundle` enforces the budget.

## Environment

Copy `.env.example` to `.env`.

| Variable | Used by |
| -- | -- |
| `DO_SPACES_KEY`, `DO_SPACES_SECRET`, `DO_SPACES_BUCKET`, `DO_SPACES_REGION`, `DO_SPACES_CDN_ENDPOINT` | `pnpm photos`, `pnpm everyday`, `upload-to-spaces` |
| `PUBLIC_MAPTILER_KEY` | the Japan deck's map (decks only) |
| `SITE_URL` | CI build |

The scripts read these from the shell environment. `pnpm everyday` also reads `.env`.

## Deployment

`.github/workflows/deploy.yml` runs on every push to `main`: install, unit tests, content validation, build (site and decks), Playwright e2e against the build, then upload `dist/` to a staging folder (`~/portfolio-next`) on the droplet, mirror it onto `/var/www/portfolio` with `rsync -a --delete` (so removed pages disappear), and reload nginx. The mirror step stops before touching the live site if the upload has no `index.html`. The droplet needs `rsync`. Pull requests have no CI; run `pnpm build`, `pnpm exec vitest run`, and `pnpm test:e2e:built` before merge.

Repository secrets: `DROPLET_HOST`, `DROPLET_USER`, `DROPLET_SSH_KEY`, `SITE_URL`, `PUBLIC_MAPTILER_KEY`.

nginx serves `/var/www/portfolio` with `try_files $uri $uri/ $uri.html =404` and `error_page 404 /404.html`. The redirects are static HTML pages, so they need no server configuration.

## Work tracking

Linear, team Studio (`STU`). The redesign is epic STU-7.
