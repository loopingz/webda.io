/**
 * Turns the plan's offset-based {@link Edit}s into content-mapper span maps.
 *
 * The plan model was already the right shape for this: an edit is
 * `[start, end) -> text`, and a span mapping is
 * `[virtualStart, virtualLength, originalStart, originalLength, kind]`. Untouched
 * regions between edits become `Verbatim` spans, which is what makes diagnostics,
 * hover and rename land on the authored text unchanged.
 *
 * Three cases:
 *
 * - **gap** (no edit) — `Verbatim`, identical length. Positions are unchanged, so
 *   every existing column outside a rewritten region is exact.
 * - **replacement** — the identifier is re-found in the generated text and mapped
 *   `Verbatim` (equal length, so it stays rename-safe); the surrounding generated
 *   text is `Atom`, which keeps diagnostics anchored on the declaration.
 * - **pure insertion** (`start === end`) — deliberately *unmapped*. The protocol
 *   treats gaps as fully synthesised content, which is exactly right for a
 *   generated `loadParameters()`: a diagnostic inside it is reported against the
 *   generated snippet rather than being falsely attributed to authored code.
 */
import type { Edit } from "./plan.ts";

/** `[virtualStart, virtualLength, originalStart, originalLength, kind, features?]` */
export type SpanMapping = [number, number, number, number, number, number?];

/** Mirrors the protocol's `SpanMapKind`. */
export const SpanMapKind = {
  /** Same length and content in both texts. */
  Verbatim: 0,
  /** Corresponding, but different length or content. */
  Atom: 1,
  /** Corresponding, and diagnostics display the original text. */
  Alias: 2
} as const;

/** Result of splicing a plan into one file. */
export interface MappedText {
  text: string;
  mappings: SpanMapping[];
}

const IDENT = /[A-Za-z_$][\w$]*/;

/**
 * Apply edits and record the span map in one pass.
 * @param original - authored file text
 * @param edits - this file's edits, any order
 * @returns generated text plus its span map
 */
export function buildMappedText(original: string, edits: Edit[]): MappedText {
  const sorted = [...edits].sort((a, b) => a.start - b.start || a.end - b.end);
  const mappings: SpanMapping[] = [];
  let out = "";
  let cursor = 0;

  const verbatim = (oStart: number, len: number) => {
    if (len <= 0) return;
    mappings.push([out.length, len, oStart, len, SpanMapKind.Verbatim]);
    out += original.slice(oStart, oStart + len);
  };

  for (const edit of sorted) {
    // Overlapping edits would corrupt the map; the planner reports them separately.
    if (edit.start < cursor) continue;
    verbatim(cursor, edit.start - cursor);

    if (edit.start === edit.end) {
      // Synthesised: leave it unmapped so diagnostics are attributed honestly.
      out += edit.text;
      cursor = edit.end;
      continue;
    }

    const originalSlice = original.slice(edit.start, edit.end);
    const originalLength = edit.end - edit.start;
    const name = IDENT.exec(originalSlice)?.[0];
    const vName = name ? edit.text.indexOf(name) : -1;
    const oName = name ? edit.start + originalSlice.indexOf(name) : -1;

    if (name && vName >= 0) {
      if (vName > 0) {
        mappings.push([out.length, vName, edit.start, originalLength, SpanMapKind.Atom]);
      }
      // Equal-length verbatim span: the only kind that is edit-safe, so rename works.
      mappings.push([out.length + vName, name.length, oName, name.length, SpanMapKind.Verbatim]);
      const tail = edit.text.length - vName - name.length;
      if (tail > 0) {
        mappings.push([out.length + vName + name.length, tail, edit.start, originalLength, SpanMapKind.Atom]);
      }
    } else {
      mappings.push([out.length, edit.text.length, edit.start, originalLength, SpanMapKind.Atom]);
    }

    out += edit.text;
    cursor = edit.end;
  }

  verbatim(cursor, original.length - cursor);
  return { text: out, mappings };
}
