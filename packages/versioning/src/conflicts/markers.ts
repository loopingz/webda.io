import { getAtPointer, setAtPointer } from "../engine/patch.js";
import type { Conflict, MergeResult, Path } from "../types.js";

const OPEN = "<<<<<<<";
const SEP = "=======";
const CLOSE = ">>>>>>>";

function formatLineMarkers(ours: string, theirs: string): string {
  // Simple whole-string wrap: OPEN ours SEP theirs CLOSE. Preserve trailing
  // newline if either side had one (both sides usually agree since they share a base).
  const trailing = ours.endsWith("\n") || theirs.endsWith("\n") ? "\n" : "";
  const oursBody = ours.endsWith("\n") ? ours.slice(0, -1) : ours;
  const theirsBody = theirs.endsWith("\n") ? theirs.slice(0, -1) : theirs;
  return `${OPEN} ours\n${oursBody}\n${SEP}\n${theirsBody}\n${CLOSE} theirs${trailing}`;
}

export function toGitMarkers<T>(result: MergeResult<T>): T {
  let out: unknown = structuredClone(result.merged);
  for (const c of result.conflicts) {
    if (c.kind === "line" && typeof c.ours === "string" && typeof c.theirs === "string") {
      out = setAtPointer(out, c.path, formatLineMarkers(c.ours, c.theirs));
    } else {
      out = setAtPointer(out, c.path, {
        __conflict: true,
        base: c.base,
        ours: c.ours,
        theirs: c.theirs
      });
    }
  }
  return out as T;
}

// Require each marker at the start of a line. 7-char `=======` appears in real
// content (markdown rules, etc.) — anchoring to line start rules out false positives.
const OPEN_RE = /^<{7}/m;
const SEP_RE = /^={7}$/m;
const CLOSE_RE = /^>{7}/m;

function containsMarkers(s: string): boolean {
  return OPEN_RE.test(s) && SEP_RE.test(s) && CLOSE_RE.test(s);
}

function isConflictSentinel(v: unknown): v is {
  __conflict: true;
  base: unknown;
  ours: unknown;
  theirs: unknown;
} {
  return (
    v !== null &&
    typeof v === "object" &&
    (v as Record<string, unknown>).__conflict === true
  );
}

export function fromGitMarkers<T>(edited: T, result: MergeResult<T>): MergeResult<T> {
  const merged: unknown = structuredClone(edited);
  const remaining: Conflict[] = [];

  for (const c of result.conflicts) {
    const v = getAtPointer(merged, c.path);
    if (c.kind === "line" && typeof c.ours === "string") {
      if (typeof v === "string" && containsMarkers(v)) {
        remaining.push(c);
        continue;
      }
      // User edited it to a plain string — accept as resolution.
      continue;
    }
    if (isConflictSentinel(v)) {
      remaining.push(c);
      continue;
    }
    // Sentinel was replaced with a concrete value — accept.
  }

  return {
    merged: merged as T,
    conflicts: remaining,
    clean: remaining.length === 0
  };
}
