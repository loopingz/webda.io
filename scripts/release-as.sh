#!/usr/bin/env bash
# Force the next release-please version of all packages
#
# Usage: pnpm release-as <version>     e.g. 4.0.0-beta.3, 4.0.0-rc.1, 4.0.0
#
# Opens an auto-merging PR on main that sets `release-as` (and the matching
# `prerelease-type`) in release-please-config.json. release-please then opens
# the release PR, and the release-please workflow removes `release-as` from
# that release PR so it is cleared when the release is merged.
set -euo pipefail

VERSION="${1:-}"
BASE="main"
CONFIG="release-please-config.json"

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-([a-z]+)\.[0-9]+)?$ ]]; then
  echo "Usage: pnpm release-as <X.Y.Z | X.Y.Z-type.N>" >&2
  exit 1
fi
PRERELEASE_TYPE="${BASH_REMATCH[2]}"

for cmd in git gh jq; do
  command -v "$cmd" > /dev/null || { echo "$cmd is required" >&2; exit 1; }
done

ROOT=$(git rev-parse --show-toplevel)
BRANCH="chore/release-as-$VERSION"
WORKTREE=$(mktemp -d)/release-as

# Work in a temporary worktree so the current checkout is left untouched
git -C "$ROOT" fetch --quiet origin "$BASE"
git -C "$ROOT" worktree add --quiet -b "$BRANCH" "$WORKTREE" "origin/$BASE"
trap 'git -C "$ROOT" worktree remove --force "$WORKTREE"; git -C "$ROOT" branch --quiet -D "$BRANCH"' EXIT

cd "$WORKTREE"
jq --arg v "$VERSION" --arg t "$PRERELEASE_TYPE" \
  '."release-as" = $v | if $t != "" then ."prerelease-type" = $t else . end' \
  "$CONFIG" > "$CONFIG.tmp"
mv "$CONFIG.tmp" "$CONFIG"

git commit --quiet -am "chore: release $VERSION"
git push --quiet -u origin "$BRANCH"
gh pr create --base "$BASE" --head "$BRANCH" --title "chore: release $VERSION" \
  --body "Sets \`release-as: $VERSION\` so release-please opens a release PR for this version. The release-please workflow removes \`release-as\` again in that release PR."
gh pr merge "$BRANCH" --auto --squash --delete-branch
