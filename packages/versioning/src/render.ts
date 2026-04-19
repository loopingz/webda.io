import { createPatch } from "diff";
import * as yaml from "yaml";

import { patch } from "./engine/patch.js";
import type { Delta } from "./types.js";
import type { VersionedPatch } from "./history.js";

export type RenderOptions = {
  /** Unified-diff context lines. Default: 3. */
  context?: number;
  /** Label for the "before" side in the diff header. Default: "base". */
  fromLabel?: string;
  /** Label for the "after" side in the diff header. Default: "patched". */
  toLabel?: string;
  /** Sort object keys alphabetically for reproducible output. Default: true. */
  sortKeys?: boolean;
};

/**
 * Serialize a value to a YAML string using block scalars for multiline strings.
 * @param value - the value to serialize
 * @param sortKeys - when `true`, object keys are sorted alphabetically for reproducible output
 * @returns a YAML string representation of `value`
 */
function toYaml(value: unknown, sortKeys: boolean): string {
  return yaml.stringify(value, {
    sortMapEntries: sortKeys,
    // Prefer block scalars for multiline strings — key reason we use YAML.
    blockQuote: true,
    // Keep output compact but readable.
    lineWidth: 0
  });
}

/**
 * Render a patch as a git-style unified diff of the YAML serialisation of
 * `base` vs. the object produced by applying `delta`. YAML is used because its
 * block-scalar syntax renders multiline string fields across multiple lines
 * — which is what makes the diff look like a real source-file diff rather
 * than a wall of JSON-escaped `\n`.
 *
 * @param base - the "before" object
 * @param delta - the delta to apply (from `diff(base, after)`)
 * @param options - formatting options
 * @returns unified-diff string; empty string when delta is a no-op
 */
export function renderPatch(base: unknown, delta: Delta, options: RenderOptions = {}): string {
  const sortKeys = options.sortKeys ?? true;
  const context = options.context ?? 3;
  const fromLabel = options.fromLabel ?? "base";
  const toLabel = options.toLabel ?? "patched";

  const after = patch(base, delta);
  const beforeYaml = toYaml(base, sortKeys);
  const afterYaml = toYaml(after, sortKeys);

  if (beforeYaml === afterYaml) return "";

  // `createPatch(fileName, oldStr, newStr, oldHeader, newHeader, options)`.
  // The first arg is used in the `Index:` line and the `a/…` / `b/…` header;
  // for our purposes we pass the fromLabel and rely on oldHeader/newHeader
  // (empty) so the diff header becomes `--- <fromLabel>` / `+++ <toLabel>`.
  // jsdiff composes the full header line as `--- ${fileName}${oldHeader ? "\t" + oldHeader : ""}`.
  const full = createPatch(fromLabel, beforeYaml, afterYaml, "", "", { context });

  // Drop the leading `Index:` and `====…` lines jsdiff emits; keep from `---` onward.
  const lines = full.split("\n");
  const start = lines.findIndex(l => l.startsWith("---"));
  const trimmed = start >= 0 ? lines.slice(start).join("\n") : full;

  // Replace the `+++ base` line (jsdiff reuses fileName for both sides) with the toLabel.
  return trimmed.replace(/^\+\+\+ .*$/m, `+++ ${toLabel}`);
}

/**
 * Render a `VersionedPatch` as a git-commit-style view: a header with the
 * commit id, author, timestamp, and message, followed by the unified diff
 * produced by `renderPatch()`.
 *
 * @param base - the "before" object
 * @param vp - the versioned patch (as produced by `commit()` or `wrap()`)
 * @param options - passed through to `renderPatch`
 * @returns formatted string (always ends with a newline when non-empty)
 */
export function renderCommit(
  base: unknown,
  vp: VersionedPatch,
  options: RenderOptions = {}
): string {
  const lines: string[] = [];
  if (vp.id) lines.push(`commit ${vp.id}`);
  if (vp.author) lines.push(`Author: ${vp.author}`);
  lines.push(`Date:   ${new Date(vp.timestamp).toISOString()}`);
  if (vp.message) {
    lines.push("");
    // Indent message lines by 4 spaces, git-style.
    for (const line of vp.message.split("\n")) lines.push(`    ${line}`);
  }
  lines.push("");
  lines.push(renderPatch(base, vp.delta, options));
  return lines.join("\n");
}
