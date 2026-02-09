# TODO

## Image Pipeline

- [ ] **Native-width srcset variants**: Re-add native-width variants (e.g. 2048w between the 1600/2400 standards) to `buildWidthList` and `process-images` for sharper rendering on retina displays. The previous implementation assumed variants existed on CDN without verifying. A robust version should either: (a) have the srcset generator check what widths actually exist on CDN, or (b) ensure `upload-images` always runs after `process-images` so all generated variants are uploaded. Removed in commit d828042.
