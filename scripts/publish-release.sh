#!/usr/bin/env bash
# Publish the packages released by release-please on the checked-out commit
#
# Usage: scripts/publish-release.sh            (DRY_RUN=1 to only print the publish commands)
#
# A package is published when its release tag (`<component>-v<version>`, component being the
# package name without scope) points at HEAD. Each package goes to the npm dist-tag of its
# version (beta, rc... or latest). Fails if a package version is neither tagged on HEAD nor
# already on npm, as its dependents would be published depending on a missing version.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
HEAD_SHA=$(git rev-parse HEAD)

# Tags created through the GitHub API are not in a shallow checkout, so ask the remote
TAGS=$(git ls-remote --tags origin | awk -v sha="$HEAD_SHA" '$1 == sha { sub("refs/tags/", "", $2); sub("\\^\\{\\}$", "", $2); print $2 }')

declare -A FILTERS
MISSING=()
for dir in $(jq -r 'keys[]' .release-please-manifest.json); do
  NAME=$(jq -r .name "$dir/package.json")
  VERSION=$(jq -r .version "$dir/package.json")
  [ "$(jq -r '.private // false' "$dir/package.json")" = "true" ] && continue
  if grep -qxF "${NAME#*/}-v$VERSION" <<< "$TAGS"; then
    DIST_TAG=$(sed -nE 's/^[0-9]+\.[0-9]+\.[0-9]+-([a-z]+)\..*/\1/p' <<< "$VERSION")
    DIST_TAG=${DIST_TAG:-latest}
    FILTERS[$DIST_TAG]+=" --filter $NAME"
    echo "release $NAME@$VERSION ($DIST_TAG)"
  elif [ -z "$(npm view "$NAME@$VERSION" version 2> /dev/null)" ]; then
    MISSING+=("$NAME@$VERSION")
  fi
done

if [ ${#MISSING[@]} -gt 0 ]; then
  echo "::error::Not tagged on $HEAD_SHA and not on npm: ${MISSING[*]}" >&2
  exit 1
fi
if [ ${#FILTERS[@]} -eq 0 ]; then
  echo "No release tag on $HEAD_SHA, nothing to publish"
  exit 0
fi

for DIST_TAG in "${!FILTERS[@]}"; do
  # Already published versions are skipped by pnpm, so a re-run only publishes what is missing
  CMD="pnpm -r ${FILTERS[$DIST_TAG]} publish --no-git-checks --tag $DIST_TAG"
  echo "$CMD"
  [ -n "${DRY_RUN:-}" ] || $CMD
done
