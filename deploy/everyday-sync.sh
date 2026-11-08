#!/bin/zsh
# Run the Everyday sync from its own worktree on main. launchd starts this script
# (deploy/com.corbin.heist-everyday-sync.plist). Install steps: README, "Everyday page".
#
# The worktree is ~/.local/share/worktrees/photography-portfolio/everyday-sync. It is used only by
# this job: the script resets it to origin/main before each run.
set -eu
setopt pipefail
export PATH="/opt/homebrew/bin:$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

WORKTREE="$HOME/.local/share/worktrees/photography-portfolio/everyday-sync"
LOCK="$TMPDIR/heist-everyday-sync.lock"
# The caption reminder: one notification a day, on the first run at or after this hour.
REMIND_HOUR=19
STATE="$HOME/.local/state/heist-everyday"
OUTPUT="$STATE/last-run.txt"

# One run at a time: a large first sync can take longer than the interval.
if ! mkdir "$LOCK" 2>/dev/null; then
  echo "$(date '+%F %T') another sync is running; skipped"
  exit 0
fi
trap 'rmdir "$LOCK"' EXIT

echo "$(date '+%F %T') sync start"
cd "$WORKTREE"
git fetch --quiet origin main
git checkout --quiet main
git reset --quiet --hard origin/main
pnpm install --frozen-lockfile --silent
mkdir -p "$STATE"
status=0
pnpm --silent everyday sync --publish 2>&1 | tee "$OUTPUT" || status=$?

# Remind once a day when frames wait for a caption. The sync prints "Held, no caption in Photos (N):".
held=$(sed -n 's/^Held, no caption in Photos (\([0-9]*\)):$/\1/p' "$OUTPUT")
today=$(date '+%F')
if [[ -n "$held" && "$held" -gt 0 && $(date '+%H') -ge $REMIND_HOUR && "$(cat "$STATE/reminded" 2>/dev/null)" != "$today" ]]; then
  noun=photos; [[ "$held" -eq 1 ]] && noun=photo
  osascript -e "display notification \"$held $noun in EDC need a caption before they publish.\" with title \"heist.studio Everyday\""
  echo "$today" > "$STATE/reminded"
  echo "$(date '+%F %T') reminded: $held held"
fi
echo "$(date '+%F %T') sync end (exit $status)"
exit $status
