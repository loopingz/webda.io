import { diff3Merge } from "node-diff3";

import { VersioningError } from "../errors.js";

export type LineConflictRegion = {
  base: string;
  ours: string;
  theirs: string;
};

export type LineMergeResult = {
  merged: string;
  conflicts: LineConflictRegion[];
  clean: boolean;
};

/**
 * Split `s` into a line array preserving trailing newlines so joining the
 * array produces a byte-identical string. CRLF and LF are treated as distinct
 * line endings; callers with mixed EOL inputs should normalize first.
 * @param s - the string to split
 * @returns an array of line strings, each including its trailing newline character
 */
function splitLines(s: string): string[] {
  if (s === "") return [];
  return s.split(/(?<=\n)/);
}

/**
 * Join an array of line strings back into a single string. Inverse of `splitLines`.
 * @param lines - the array of line strings to join
 * @returns the concatenated string
 */
function joinLines(lines: string[]): string {
  return lines.join("");
}

/**
 * Perform a 3-way line-level merge of three strings.
 * @param base - the common ancestor string
 * @param ours - our local version of the string
 * @param theirs - their remote version of the string
 * @returns a `LineMergeResult` with the merged string, any conflict regions, and a `clean` flag
 */
export function lineMerge3(base: string, ours: string, theirs: string): LineMergeResult {
  const chunks = diff3Merge(splitLines(ours), splitLines(base), splitLines(theirs), {
    // excludeFalseConflicts prevents the "both sides made same change" case from surfacing.
    excludeFalseConflicts: true
  });

  const mergedParts: string[] = [];
  const conflicts: LineConflictRegion[] = [];

  for (const chunk of chunks) {
    if (chunk.ok) {
      mergedParts.push(joinLines(chunk.ok));
    } else if (chunk.conflict) {
      // Default: keep ours in the merged string; caller resolves via Conflict API.
      mergedParts.push(joinLines(chunk.conflict.a));
      conflicts.push({
        base: joinLines(chunk.conflict.o),
        ours: joinLines(chunk.conflict.a),
        theirs: joinLines(chunk.conflict.b)
      });
    } else {
      throw new VersioningError(
        "BAD_FORMAT",
        `lineMerge3: unexpected chunk shape from node-diff3: ${JSON.stringify(chunk)}`
      );
    }
  }

  return {
    merged: mergedParts.join(""),
    conflicts,
    clean: conflicts.length === 0
  };
}
