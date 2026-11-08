#!/bin/zsh
# Run the Everyday sync from its own worktree on main. launchd starts this script
# (deploy/com.corbin.heist-everyday-sync.plist). Install steps: README, "Everyday page".
#
# The worktree is ~/.local/share/worktrees/photography-portfolio/everyday-sync. It is used only by
# this job: the script resets it to origin/main before each run.
set -eu
export PATH="/opt/homebrew/bin:$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

WORKTREE="$HOME/.local/share/worktrees/photography-portfolio/everyday-sync"
LOCK="$TMPDIR/heist-everyday-sync.lock"

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
pnpm --silent everyday sync --publish
echo "$(date '+%F %T') sync end"
