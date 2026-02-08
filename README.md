# Photography Portfolio

A minimalist, image-first photography portfolio built with [Astro](https://astro.build). Zero JavaScript by default, smooth scroll animations, responsive image delivery via DigitalOcean Spaces CDN, and Substack integration for blog content.

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Astro 5 (static output) |
| Styling | Vanilla CSS + Custom Properties |
| Animations | GSAP + Lenis |
| Image Storage | DigitalOcean Spaces (S3-compatible CDN) |
| Image Processing | Sharp (offline scripts) |
| Content | Astro Content Collections (YAML + Zod schemas) |
| Blog | Substack RSS feed, parsed at build time |
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

### Fonts

Download [Inter](https://rsms.me/inter/) and place the variable-weight `inter-latin.woff2` file in `public/fonts/`.

## Content Architecture

Content is organized as YAML files in a three-level hierarchy:

```
Collections → Albums → Photos
 (e.g. "Landscapes" → "Iceland 2024" → individual photos)
```

Each level lives in its own directory under `src/data/` and is validated by Zod schemas in `src/content.config.ts`.

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

```yaml
title: Iceland 2024
description: Southern Iceland — northern lights, black sand, glaciers.
coverPhoto: iceland-001          # references a photo ID
photos:                           # ordered list of photo IDs
  - iceland-001
  - iceland-002
  - iceland-003
date: "2024-09"
location: Iceland
layout: masonry                   # masonry | grid | horizontal-scroll
draft: false
sortOrder: 1
```

### Collections (`src/data/collections/*.yaml`)

```yaml
title: Landscapes
description: Wide open spaces and dramatic light.
albums:
  - iceland-2024                  # ordered list of album IDs
coverPhoto: iceland-001
sortOrder: 1
```

### Site Settings (`src/data/settings.yaml`)

Site name, author info, Substack URL, and social links.

## Gallery Layouts

Each album chooses its display style via the `layout` field:

- **`masonry`** (default) — Pinterest-style columns, photos keep their natural aspect ratios
- **`grid`** — Uniform aspect ratio grid (configurable via `gridAspectRatio`, e.g. `"3:2"`)
- **`horizontal-scroll`** — Cinematic horizontal strip, one photo at a time, driven by GSAP ScrollTrigger pin + scrub

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

The `<Photo />` component renders a `<picture>` element with AVIF/WebP `srcset` and the LQIP as a CSS background for instant blur-up.

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

Dark theme by default with a light theme toggle. The active theme persists in `localStorage`. An inline script in `<head>` sets the theme before first paint to prevent flash.

CSS custom properties drive the entire color system — no accent color. The photography provides all the color.

## Project Structure

```
photography-portfolio/
├── .github/workflows/
│   └── deploy.yml              # GitHub Actions CI/CD
├── public/
│   ├── fonts/                  # Self-hosted woff2 files
│   ├── favicon.svg
│   └── robots.txt
├── scripts/                    # Node.js image pipeline scripts
│   ├── process-images.ts       # Sharp resize + format conversion + LQIP
│   ├── upload-to-spaces.ts     # S3 upload to DO Spaces
│   └── generate-photo-yaml.ts  # EXIF extraction + YAML generation
├── src/
│   ├── components/
│   │   ├── blog/               # BlogCard, BlogSection
│   │   ├── global/             # Header, Footer, ThemeToggle, SEO
│   │   ├── home/               # HeroSection, FeaturedWork, AboutTeaser
│   │   ├── photo/              # Photo, PhotoGrid, AlbumCard, PhotoLightbox
│   │   └── ui/                 # Button, Container
│   ├── content.config.ts       # Zod schemas for all content collections
│   ├── data/
│   │   ├── albums/             # Album YAML files
│   │   ├── collections/        # Collection YAML files
│   │   ├── loaders/
│   │   │   └── substack-loader.ts
│   │   ├── photos/             # Photo YAML files
│   │   └── settings.yaml       # Site configuration
│   ├── layouts/
│   │   ├── BaseLayout.astro    # HTML shell, ClientRouter, fonts, theme
│   │   ├── GalleryLayout.astro # Minimal chrome for gallery views
│   │   └── PageLayout.astro    # Standard page with header/footer
│   ├── pages/
│   │   ├── index.astro
│   │   ├── work/
│   │   │   ├── index.astro             # All collections
│   │   │   └── [collection]/
│   │   │       ├── index.astro         # Albums in a collection
│   │   │       └── [album].astro       # Single album gallery
│   │   ├── about.astro
│   │   ├── blog.astro
│   │   └── 404.astro
│   ├── scripts/
│   │   ├── animations/         # init.ts, reveals.ts, parallax.ts, gallery.ts
│   │   ├── lightbox.ts         # Fullscreen photo viewer logic
│   │   └── theme.ts            # Dark/light mode persistence
│   └── styles/
│       ├── global.css          # Reset, custom properties, typography
│       ├── fonts.css           # @font-face declarations
│       └── animations.css      # Animation initial states + reduced motion
├── _raw/                       # Drop raw photos here (gitignored)
├── astro.config.mjs
├── Caddyfile                   # Caddy config (unused — using Nginx)
├── tsconfig.json
└── package.json
```

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
2. Attempts to fetch fresh Substack RSS (falls back to cached file if blocked)
3. Runs `astro check` (type checking) and `astro build`
4. SCPs the `dist/` directory to the droplet
5. Reloads Nginx

Deploy steps are skipped if secrets aren't configured yet.

Required GitHub repository secrets:

| Secret | Value |
|---|---|
| `DROPLET_HOST` | Droplet IP or hostname |
| `DROPLET_USER` | SSH username (e.g. `deploy`) |
| `DROPLET_SSH_KEY` | Private SSH key for the deploy user |
| `SUBSTACK_RSS_URL` | Substack RSS feed URL (optional) |
| `SITE_URL` | Production URL |

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

### New Collection

Create a YAML file in `src/data/collections/`:

```yaml
title: My Collection
description: Description here.
albums:
  - album-id
coverPhoto: photo-id
sortOrder: 1
```

The new collection will automatically appear at `/work/` and generate routes at `/work/[collection-id]/`.
