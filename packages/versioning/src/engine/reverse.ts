import { create as createJdp } from "jsondiffpatch";

import { lineReverse } from "../strings/line-diff.js";
import type { Delta, Path, UnifiedDiff } from "../types.js";

export function reverse(delta: Delta): Delta {
  const jdp = createJdp({});
  const reversedOps = delta.ops ? jdp.reverse(delta.ops) : undefined;
  let reversedHunks: Record<Path, UnifiedDiff> | undefined;
  if (delta.stringHunks) {
    reversedHunks = {};
    for (const [path, hunks] of Object.entries(delta.stringHunks)) {
      reversedHunks[path] = lineReverse(hunks);
    }
  }
  return {
    __versioning: 1,
    ...(reversedOps !== undefined ? { ops: reversedOps } : {}),
    ...(reversedHunks ? { stringHunks: reversedHunks } : {})
  };
}
