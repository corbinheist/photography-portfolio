# Essay Page Authoring Guide

Photo essays present a sequenced narrative — images and writing interleaved with intentional pacing, where each slide fills the viewport and the reader advances one frame at a time.

Essays use `scroll-snap-type: y mandatory`. Every slide snaps. Readers click images to open the lightbox for detail.

## Slide Types

### Full-Bleed (`EssaySlideFullBleed`)

Single image fills the viewport. The heaviest visual weight of any slide.

```astro
<EssaySlideFullBleed
  url={photo.url}
  width={photo.width}
  height={photo.height}
  lqip={photo.lqip}
  alt="Description"
  lightboxIndex={0}
/>
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `url` | string | required | CDN base URL (no extension) |
| `width` | number | required | Original image width |
| `height` | number | required | Original image height |
| `lqip` | string | required | Base64 blur placeholder |
| `alt` | string | required | Alt text |
| `lightboxIndex` | number | — | Position in lightbox sequence |
| `fit` | `'cover' \| 'contain'` | auto | Landscape defaults to `cover`, portrait defaults to `contain` |
| `overlayPosition` | `'bottom-left' \| 'bottom-center' \| 'center'` | — | Text overlay position |
| `captionTitle` | string | — | Caption bar title text |
| `captionMeta` | string | — | Caption bar secondary text (EXIF, location) |
| `loading` | `'lazy' \| 'eager'` | `'lazy'` | Set `eager` for hero/first slide |

**Orientation behavior:**
- Landscape: `object-fit: cover` — fills viewport, may crop edges
- Portrait: `object-fit: contain` — shows full image, black pillarbox

**Use for:** Hero images, section openers/closers, the single strongest image in a sequence.

---

### Image + Text (`EssaySlideImageText`)

55/45 split — image alongside prose. The narrative workhorse.

```astro
<EssaySlideImageText
  url={photo.url}
  width={photo.width}
  height={photo.height}
  lqip={photo.lqip}
  alt="Description"
  lightboxIndex={1}
  flip
>
  <h3>Section Title</h3>
  <p>Narrative text here.</p>
</EssaySlideImageText>
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `flip` | boolean | `false` | Reverses layout: image right (45%), prose left (55%) |

**Orientation behavior:**
- Landscape: `object-fit: cover` — fills the image panel naturally
- Portrait: `object-fit: cover` with `object-position: top center` — anchors to top so faces aren't cropped

**Use for:** Story beats that pair a specific moment with its narrative context.

**Tip:** Alternate `flip` across consecutive image-text slides to create a zigzag reading pattern.

---

### Diptych (`EssaySlideDiptych`)

Two images side by side. Orientation-aware.

```astro
<EssaySlideDiptych
  photos={[
    { ...photo1, alt: "Left image", lightboxIndex: 2 },
    { ...photo2, alt: "Right image", lightboxIndex: 3 },
  ]}
  gap="tight"
  caption="Optional shared caption"
/>
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `photos` | `[PhotoData, PhotoData]` | required | Exactly two photos |
| `gap` | `'none' \| 'tight' \| 'normal'` | `'tight'` | Space between images |
| `caption` | string | — | Shared caption below |

**Orientation behavior:**
- **Landscape pair:** Width-filling. Images stretch to fill container width, height follows from aspect ratio. Flex-ratio matching ensures equal rendered heights.
- **Portrait pair:** Height-constrained (85dvh). Images sized by height, centered horizontally. No width stretch.

**Use for:** Comparison, two perspectives on the same moment, portrait pairs, before/after.

**Tip:** Both images should share similar tonal range or subject matter. Mismatched pairs feel accidental.

---

### Triptych (`EssaySlideTriptych`)

Three images side by side. Same orientation logic as diptych.

```astro
<EssaySlideTriptych
  photos={[
    { ...photo1, alt: "Left", lightboxIndex: 4 },
    { ...photo2, alt: "Center", lightboxIndex: 5 },
    { ...photo3, alt: "Right", lightboxIndex: 6 },
  ]}
  gap="tight"
/>
```

**Props:** Same as diptych but with three photos.

**Orientation behavior:**
- **Landscape:** Width-filling, works well
- **Portrait:** Height-constrained (75dvh) — three narrow columns, use sparingly

**Use for:** Establishing environment, showing a process sequence, rhythmic repetition across a scene.

**Tip:** Landscape triptychs work best. Three portraits gets very narrow per column.

---

### Mini Gallery (`EssaySlideMiniGallery`)

Masonry grid of 4-12 images in a single slide.

```astro
<EssaySlideMiniGallery
  photos={galleryPhotos.map((p, i) => ({
    ...p,
    alt: p.title,
    lightboxIndex: startIndex + i,
  }))}
  columns={3}
  caption="Camp life, Djebel Saghro"
/>
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `photos` | `PhotoData[]` | required | 4-12 photos |
| `columns` | `2 \| 3` | `3` | Column count (drops to 2 on mobile) |
| `caption` | string | — | Shared caption below |

**Use for:** Camp life details, gear/process shots, contact-sheet feel, any moment where density matters more than individual emphasis.

**Tip:** Mix portrait and landscape images for a natural masonry feel. Pure landscape grids look like a table.

---

### Text (`EssaySlideText`)

Full-viewport text slide. No images.

```astro
<EssaySlideText align="center">
  <p class="overline">Region &middot; Coordinates</p>
  <h2>Section Title</h2>
  <p>One to two sentences of context.</p>
</EssaySlideText>
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `align` | `'left' \| 'center'` | `'center'` | Text alignment |

**Available elements:**
- `<p class="overline">` — small mono caps for location, region, or category labels
- `<h1>`, `<h2>`, `<h3>` — headings (Instrument Serif)
- `<p>` — body text (IBM Plex, muted)
- `<strong>` — emphasized text (full color)

**Use for:** Essay title, section transitions, pull quotes, closing credits.

---

### Flow (`EssaySlideFlow`)

Prose slide, vertically centered. Same snap behavior as other slides.

```astro
<EssaySlideFlow>
  <h2>Section Title</h2>
  <p>Longer narrative text that needs more room than an image-text split provides.</p>
  <p>Second paragraph continues the thought.</p>
</EssaySlideFlow>
```

**No props** — content goes in the slot.

**Use for:** Longer narrative passages between image sequences. When the prose needs to stand alone without competing with an image.

---

## Sequencing

### Core Principles

1. **Never stack the same type.** Two full-bleeds back-to-back = slideshow. Two image-text slides in a row = textbook.

2. **The narrative unit is: image → context → image.** Full-bleed establishes a moment, image-text or flow gives it meaning, next image moves the story forward.

3. **Full-bleeds bracket sections.** Open with a full-bleed (strongest image for that section), close with another. Use image-text, diptychs, and flow slides between them.

4. **Diptychs and triptychs are supporting evidence.** They show range, detail, or atmosphere after you've established what the section is about. Don't use them as section openers.

5. **Text slides are breathing room.** Place them between sections to reset the reader's visual pace.

6. **Alternate flip on image-text slides.** Image-left, then image-right. Zigzag keeps the eye moving.

### Template: Standard Section (5-8 slides)

```
FullBleed           — section hero, strongest image
Text                — section title + 1-2 sentence setup
ImageText           — first story beat, image + narrative
Diptych             — supporting pair (portraits, details)
ImageText (flip)    — second story beat, reversed layout
FullBleed           — closing image for the section
```

### Template: Full Essay Structure

```
=== OPENING ===
FullBleed (hero)    — the image that defines the essay
Text (centered)     — title, location, coordinates

=== SECTION 1 ===
ImageText           — first narrative beat
FullBleed           — establishing landscape/environment
Diptych             — detail pair
ImageText (flip)    — second narrative beat

=== SECTION 2 ===
Text                — section transition
FullBleed           — section hero
Flow                — longer prose passage
ImageText           — key moment
Triptych            — environmental sequence
FullBleed           — section closer

=== SECTION 3 ===
Text                — section transition
FullBleed           — section hero
Diptych             — character pair
ImageText (flip)    — narrative beat
MiniGallery         — collected details
FullBleed           — section closer

=== CLOSING ===
FullBleed           — final image
Text (centered)     — credits, gear, coordinates
```

### Orientation Quick Reference

| Orientation | Full-Bleed | Image-Text | Diptych | Triptych |
|------------|-----------|-----------|---------|----------|
| Landscape | Cover, fills viewport | Natural fit | Width-filling | Width-filling |
| Portrait | Contain, centered | Top-anchored crop | Height-constrained, centered | Narrow — avoid |

## Authoring Workflow

1. **Sequence photos first.** Lay out the narrative arc: first image, last image, 3-4 sections between.
2. **Assign each photo a role:**
   - Hero → full-bleed
   - Story → image-text
   - Supporting → diptych/triptych
   - Texture → mini gallery
3. **Map roles to slide types** using the sequencing principles.
4. **Write prose last.** Fit words to images, not the reverse.

## Page Setup

Every essay page follows this structure:

```astro
---
import EssayLayout from '@layouts/EssayLayout.astro';
import EssaySlideFullBleed from '@components/essay/EssaySlideFullBleed.astro';
// ... import other slide types as needed

const photos = [
  {
    url: 'https://cdn.example.com/photos/image-name',
    width: 8192,
    height: 5464,
    lqip: 'data:image/webp;base64,...',
    title: 'Descriptive Title',
    exif: { camera: '...', lens: '...', focalLength: '...', aperture: '...', shutter: '...', iso: 0 },
  },
  // ... more photos in narrative order
];
---

<EssayLayout
  title="Essay Title"
  description="Meta description for SEO."
  photos={photos}
>
  <!-- slides go here -->
</EssayLayout>
```

**Key details:**
- Photos array order = lightbox order. `lightboxIndex` values must match array indices.
- `EssayLayout` wraps `BaseLayout`, includes lightbox and nav (progress bar, dots, keyboard).
- Lenis smooth scroll is automatically disabled on essay pages.
- The `data-essay` attribute on `<body>` activates snap scrolling and nav scripts.

## Location Branding

When calling out locations, include generalized coordinates:
- 1 minute of lat/long accuracy (region-level, not precise)
- Altitude if relevant
- Format: `31°16'N  5°59'W  2,100m`
- Use HTML entities: `&deg;` `&prime;` `&ensp;`

Place coordinates in:
- Hero slide subtitle (dimmed mono below location name)
- Opening overline
- Credits slide
