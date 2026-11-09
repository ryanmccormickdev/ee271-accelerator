#!/usr/bin/env bash
# One-time: put this repo on GitHub as a PRIVATE repo and invite your project partner.
#
#   scripts/share-on-github.sh <partner-github-username> [repo-name]
#
# Keep it private: the honor code forbids letting other students see your project code.
set -euo pipefail
cd "$(dirname "$0")/.."

PARTNER="${1:?usage: scripts/share-on-github.sh <partner-github-username> [repo-name]}"
NAME="${2:-ee271-project}"
command -v gh >/dev/null || { echo "Needs the GitHub CLI: brew install gh && gh auth login"; exit 1; }

if git remote get-url origin >/dev/null 2>&1; then
  echo ">> Remote 'origin' already exists ($(git remote get-url origin)); pushing to it"
  git push -u origin main
else
  echo ">> Creating PRIVATE GitHub repo '$NAME' and pushing"
  gh repo create "$NAME" --private --source=. --remote=origin --push
fi

REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
[ "$(gh repo view --json visibility -q .visibility)" = "PRIVATE" ] || { echo "WARNING: $REPO is not private! Fix: gh repo edit $REPO --visibility private"; exit 1; }
gh api -X PUT "repos/$REPO/collaborators/$PARTNER" -f permission=push >/dev/null
echo ">> Invited $PARTNER to $REPO (they need to accept the invite from GitHub's email/notifications)."
echo "   Then they run:"
echo "     git clone https://github.com/$REPO.git && cd $(basename "$REPO") && make setup && make test"
