# Performance Baseline

Recorded on 2026-07-12 from a production Astro build. These measurements establish regression budgets for Phase 0; Phase 1 is responsible for materially reducing the MapLibre payload and measuring field-style Core Web Vitals.

## Build Output

| Metric | Baseline |
|---|---:|
| Total `dist/` size | 6.67 MiB |
| Total `_assets/` size | 1.53 MiB |
| Map JavaScript | 1,059,004 B raw / 285,732 B gzip |
| Base layout JavaScript | 140,268 B raw / 52,463 B gzip |
| Map CSS | 72,614 B raw / 10,787 B gzip |

The MapLibre bundle is the dominant client asset and is currently included through the persistent map shell. Phase 1 should prevent this payload from loading on routes that never display a map.

## Representative HTML

| Route | Raw | Gzip |
|---|---:|---:|
| `/` | 139,207 B | 33,918 B |
| `/work` | 142,324 B | 33,401 B |
| `/work/morocco` | 141,024 B | 34,382 B |
| `/work/morocco/wise-essay` | 220,535 B | 43,818 B |

The largest generated page is `/gallery` at approximately 500 KiB raw because it contains metadata for the complete photo catalog.

Essay HTML is larger because photo manifests include responsive image metadata and LQIP data. This is expected, but the build budget prevents accidental unbounded growth.

## Regression Budgets

`pnpm check:bundle` enforces deliberately loose Phase 0 ceilings:

- Largest JavaScript asset: 1,100,000 B
- Total JavaScript: 1,250,000 B
- Largest CSS asset: 80,000 B
- Largest HTML page: 525,000 B

These are regression guards, not final targets. Tighten them after MapLibre lazy loading and image-delivery work land.

## Phase 1 Targets

- Less than 250 KiB compressed initial JavaScript on non-map pages
- No MapLibre payload on routes that never display a map
- Representative mobile LCP below 2.5 seconds
- CLS below 0.1

Core Web Vitals require a running production-like server and browser instrumentation. Capture those measurements as part of the Phase 1 implementation rather than treating static bundle size as a substitute.
