#!/usr/bin/env bash
# Bring the course staff's starter code into this repo.
#
#   scripts/pull-starter.sh part1   # pull any fixes staff pushed to simd-part1
#   scripts/pull-starter.sh part2   # first time: imports simd-part2 as a new part2/ folder
#
# The starter repos live at https://code.stanford.edu/EE271/simd-partN (readable over
# HTTPS, no SSH key needed). If staff name a later part differently, override:
#   STARTER_URL=https://code.stanford.edu/EE271/<name>.git scripts/pull-starter.sh part2
#
# Under the hood this is `git subtree`: each part's starter code is merged into its own
# folder, with the staff's history squashed into one commit per update.
set -euo pipefail
cd "$(dirname "$0")/.."

PART="${1:?usage: scripts/pull-starter.sh partN}"
N="${PART#part}"
URL="${STARTER_URL:-https://code.stanford.edu/EE271/simd-part${N}.git}"
BRANCH="${STARTER_BRANCH:-main}"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "You have uncommitted changes. Commit them first (git add -A && git commit -m '...'), then re-run."
  exit 1
fi

if [ -d "$PART" ]; then
  echo ">> Pulling staff updates from $URL into $PART/"
  git subtree pull --prefix="$PART" "$URL" "$BRANCH" --squash -m "Pull staff starter updates into $PART"
else
  echo ">> Importing $URL as $PART/"
  git subtree add --prefix="$PART" "$URL" "$BRANCH" --squash -m "Import course starter into $PART"
  echo ">> Next: make setup PART=$PART"
fi
echo ">> Done. If git reported a CONFLICT, see 'Merge conflicts' in docs/WORKFLOW.md."
