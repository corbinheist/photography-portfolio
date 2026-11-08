# /// script
# requires-python = ">=3.11"
# dependencies = ["osxphotos>=0.68"]
# ///
"""Export the still photographs of one Apple Photos album for the Everyday page.

Usage: uv run scripts/everyday/export_album.py --album EDC --out _raw/everyday --frames frames.json

The script reads the Photos library. It never changes the library.

For each still photograph in the album it writes one entry to the frames file:
  id           everyday-<first 8 characters of the Photos uuid>-<6 characters of a version hash>.
               An edit in Photos changes the version, so the CDN never serves a stale variant.
  name         the original file name (for example R0001234.JPG), to find the frame in Photos.
  alt          the Photos caption (the "Add a Caption" field), or empty.
  date         the capture date, YYYY-MM-DD, in the time zone of the capture.
  taken        the capture time, ISO 8601, for the sort order.
  coordinates  latitude and longitude rounded to 2 decimal places, or absent.
  file         the exported JPEG, relative to the repository root. Absent when the export failed.

A frame is exported only when its JPEG does not exist yet. A JPEG that no album frame uses is deleted.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

import osxphotos
from osxphotos.photoexporter import ExportOptions, PhotoExporter

COORDINATE_DECIMALS = 2


# Raise this when the image pipeline changes its output, so every frame gets new CDN objects.
# 2: variants of frames with EXIF orientation 5 to 8 are rotated upright (STU-84).
PIPELINE_VERSION = 2


def frame_id(photo: osxphotos.PhotoInfo) -> str:
    # The version follows the edit state and the pipeline, so a new edit or a pipeline change gives a
    # new id and new CDN objects. The sync never overwrites an object on the CDN.
    version_source = f"{PIPELINE_VERSION}|{photo.uuid}|{photo.hasadjustments}|{photo.date_modified.isoformat() if photo.hasadjustments and photo.date_modified else ''}"
    version = hashlib.sha256(version_source.encode()).hexdigest()[:6]
    return f"everyday-{photo.uuid[:8].lower()}-{version}"


def rounded(value: float | None) -> float | None:
    return None if value is None else round(value, COORDINATE_DECIMALS)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--album", required=True, help="The album name in Apple Photos.")
    parser.add_argument("--out", required=True, type=Path, help="The directory for the exported JPEG files.")
    parser.add_argument("--frames", required=True, type=Path, help="The JSON file to write.")
    parser.add_argument("--root", type=Path, default=Path.cwd(), help="The repository root.")
    # A launchd job cannot read the "last opened library" preference, so the path is explicit.
    parser.add_argument("--library", type=Path, default=Path.home() / "Pictures" / "Photos Library.photoslibrary", help="The Photos library.")
    # Local tests only. The scheduled sync does not pass it.
    parser.add_argument("--limit", type=int, default=0, help="Test only: read the newest N frames.")
    args = parser.parse_args()

    if not args.library.exists():
        print(f"Photos library not found: {args.library}. Pass --library.", file=sys.stderr)
        return 2
    db = osxphotos.PhotosDB(dbfile=str(args.library))
    # Match the name without surrounding spaces and without case: Photos keeps a typed trailing space.
    wanted = args.album.strip().casefold()
    albums = [album for album in db.album_info if album.title.strip().casefold() == wanted]
    if not albums:
        print(f"Album not found in Apple Photos: {args.album!r}", file=sys.stderr)
        return 2
    if len(albums) > 1:
        print(f"More than one album is named {args.album!r}. Rename one of them.", file=sys.stderr)
        return 2

    out: Path = args.out
    out.mkdir(parents=True, exist_ok=True)
    frames: list[dict] = []
    skipped_media = 0

    photos = sorted(albums[0].photos, key=lambda p: p.date, reverse=True)
    if args.limit:
        photos = photos[: args.limit]
    for photo in photos:
        # Stills only: no videos. A Live Photo exports its still image.
        if photo.ismovie or photo.isphoto is False:
            skipped_media += 1
            continue

        fid = frame_id(photo)
        latitude, longitude = photo.location
        frame: dict = {
            "id": fid,
            "uuid": photo.uuid,
            "name": photo.original_filename,
            "alt": (photo.description or "").strip(),
            "date": photo.date.date().isoformat(),
            "taken": photo.date.isoformat(),
        }
        if latitude is not None and longitude is not None:
            frame["coordinates"] = {"latitude": rounded(latitude), "longitude": rounded(longitude)}

        target = out / f"{fid}.jpg"
        if not target.exists():
            options = ExportOptions(
                edited=photo.hasadjustments,
                convert_to_jpeg=True,
                jpeg_quality=0.95,
                download_missing=photo.ismissing or not photo.path,
                use_photos_export=photo.ismissing or not photo.path,
                live_photo=False,
                raw_photo=False,
                overwrite=True,
            )
            result = PhotoExporter(photo).export(str(out), filename=f"{fid}.jpg", options=options)
            written = [Path(p) for p in result.exported + result.converted_to_jpeg if Path(p).exists()]
            jpeg = next((p for p in written if p.suffix.lower() in {".jpg", ".jpeg"}), None)
            if jpeg is None:
                print(f"Export failed for {fid} ({photo.original_filename}): {result.error or 'no JPEG written'}", file=sys.stderr)
                frame["error"] = "export failed"
            else:
                if jpeg != target:
                    jpeg.rename(target)
                # Remove anything else the export wrote for this frame (for example a sidecar).
                for extra in written:
                    if extra.exists() and extra != target:
                        extra.unlink()
        if target.exists():
            frame["file"] = str(target.resolve().relative_to(args.root.resolve()))
        frames.append(frame)

    # Delete JPEG files that no album frame uses any more.
    used = {f"{frame['id']}.jpg" for frame in frames}
    for stale in out.glob("*.jpg"):
        if stale.name not in used:
            stale.unlink()

    frames.sort(key=lambda frame: frame["taken"], reverse=True)
    args.frames.write_text(json.dumps({"album": args.album, "skippedMedia": skipped_media, "frames": frames}, indent=2))
    print(f"{args.album}: {len(frames)} still frame(s), {skipped_media} video(s) skipped.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
