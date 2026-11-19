"""Make sure the Photos library on this Mac has synced with iCloud before the export reads it.

The export reads the local Photos library. A photograph added to the album on the iPhone reaches the
page only after the library on the Mac has synced with iCloud. When the Mac was asleep, the library
can be many hours behind, and the export then publishes an old album (2026-11-16: 32 frames late).

Photos writes the time of its last iCloud sync to
  <library>/resources/cpl/cloudsync.noindex/syncstatus.plist   key: lastSyncDate
This module reads that time. It never changes the library.

Behaviour of ensure_recent_sync:
  1. Print the time of the last iCloud sync.
  2. If the last sync is recent, return.
  3. If Photos is running, print a warning and return. Photos syncs by itself while it runs, and the
     job has no other way to start a sync.
  4. Otherwise open Photos in the background and wait until lastSyncDate changes. Photos stays open.
  5. If lastSyncDate does not change before the timeout, print a warning and return.
The export continues in every case. A warning line starts with "WARNING".
"""

from __future__ import annotations

import plistlib
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

# The last sync is "recent" when it is not older than the interval at which Photos refreshes from
# iCloud by itself. Photos stores that interval next to the sync status. This value is used only
# when the file does not give one; it is the value Photos used on 2026-11-16.
DEFAULT_REFRESH_INTERVAL_SECONDS = 7200

# The longest time to wait for Photos to sync after the job opens it. On 2026-11-16 the sync time
# changed 8 seconds after Photos opened. 300 seconds gives a large margin, and it is short compared
# to the one-hour job interval. After the timeout the export still runs, and the next run tries again.
SYNC_WAIT_TIMEOUT_SECONDS = 300
POLL_SECONDS = 2


def _cloudsync_dir(library: Path) -> Path:
    return library / "resources" / "cpl" / "cloudsync.noindex"


def last_sync_date(library: Path) -> datetime | None:
    """Return the time of the last iCloud sync, or None when the library does not record one."""
    try:
        with (_cloudsync_dir(library) / "syncstatus.plist").open("rb") as handle:
            value = plistlib.load(handle).get("lastSyncDate")
    except (OSError, plistlib.InvalidFileException):
        return None
    if not isinstance(value, datetime):
        return None
    # plistlib returns a naive datetime in UTC.
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def refresh_interval_seconds(library: Path) -> int:
    try:
        with (_cloudsync_dir(library) / "cloudphotos-1.0.plist").open("rb") as handle:
            value = plistlib.load(handle).get("configuration", {}).get("refresh.interval.seconds")
    except (OSError, plistlib.InvalidFileException):
        return DEFAULT_REFRESH_INTERVAL_SECONDS
    return value if isinstance(value, int) and value > 0 else DEFAULT_REFRESH_INTERVAL_SECONDS


def photos_is_running() -> bool:
    return subprocess.run(["/usr/bin/pgrep", "-x", "Photos"], capture_output=True).returncode == 0


def open_photos() -> None:
    # -g: do not bring Photos to the front. -j: start it hidden.
    subprocess.run(["/usr/bin/open", "-g", "-j", "-a", "Photos"], check=True)


def _local(moment: datetime) -> str:
    return moment.astimezone().strftime("%Y-%m-%d %H:%M:%S %z")


def _duration(seconds: float) -> str:
    minutes = int(seconds // 60)
    return f"{minutes // 60} h {minutes % 60} min" if minutes >= 60 else f"{minutes} min"


def ensure_recent_sync(
    library: Path,
    *,
    timeout: float = SYNC_WAIT_TIMEOUT_SECONDS,
    is_running: Callable[[], bool] = photos_is_running,
    launch: Callable[[], None] = open_photos,
    now: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
    sleep: Callable[[float], None] = time.sleep,
    log: Callable[[str], None] = lambda line: print(line, file=sys.stderr),
) -> bool:
    """Return True when the library has a recent iCloud sync at the time the function returns."""
    before = last_sync_date(library)
    if before is None:
        log("WARNING: the Photos library records no iCloud sync time. The export reads the library as it is.")
        return False
    limit = refresh_interval_seconds(library)
    age = (now() - before).total_seconds()
    log(f"Photos library: last iCloud sync {_local(before)} ({_duration(age)} ago).")
    if age <= limit:
        return True

    if is_running():
        log(f"WARNING: the last iCloud sync is older than {_duration(limit)}, and Photos is running. The export reads the library as it is.")
        return False

    log(f"The last iCloud sync is older than {_duration(limit)}. Opening Photos and waiting for a sync...")
    try:
        launch()
    except (OSError, subprocess.CalledProcessError) as error:
        log(f"WARNING: could not open Photos ({error}). The export reads the library as it is.")
        return False
    waited = 0.0
    while waited < timeout:
        sleep(POLL_SECONDS)
        waited += POLL_SECONDS
        after = last_sync_date(library)
        if after is not None and after > before:
            log(f"Photos library: iCloud sync at {_local(after)}, {int(waited)} s after Photos opened.")
            return True
    log(f"WARNING: Photos did not sync with iCloud in {int(timeout)} s. The export reads the library as it is.")
    return False
