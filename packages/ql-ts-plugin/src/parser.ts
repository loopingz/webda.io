/**
 * Lightweight WebdaQL query parser for the TS plugin.
 *
 * Extracts field names from SELECT and UPDATE SET clauses
 * without needing the full ANTLR runtime. This is intentionally
 * minimal — it only needs to identify which fields are referenced,
 * not evaluate the query.
 */

export interface ParsedFields {
  type?: "DELETE" | "UPDATE" | "SELECT";
  /** Fields in a SELECT field list */
  fields?: string[];
  /** Assignment targets in UPDATE SET */
  assignmentFields?: string[];
}

/**
 * Find the index of an unquoted keyword (case-insensitive)
 */
function findUnquotedKeyword(str: string, keyword: string): number {
  let inSingle = false;
  let inDouble = false;
  const upper = keyword.toUpperCase();
  for (let i = 0; i <= str.length - upper.length; i++) {
    const ch = str[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (!inSingle && !inDouble) {
      if (
        str.substring(i, i + upper.length).toUpperCase() === upper &&
        (i === 0 || /\s/.test(str[i - 1])) &&
        (i + upper.length === str.length || /\s/.test(str[i + upper.length]))
      ) {
        return i;
      }
    }
  }
  return -1;
}

/**
 * Parse comma-separated field names from a string, stopping at a boundary keyword
 */
function parseFieldList(str: string): string[] {
  // Find end of field list (WHERE, ORDER BY, LIMIT, OFFSET or end of string)
  let end = str.length;
  for (const kw of ["WHERE", "ORDER BY", "LIMIT", "OFFSET"]) {
    const idx = findUnquotedKeyword(str, kw);
    if (idx !== -1 && idx < end) end = idx;
  }
  const fieldStr = str.substring(0, end).trim();
  if (!fieldStr) return [];
  return fieldStr
    .split(",")
    .map(f => f.trim())
    .filter(f => f.length > 0);
}

/**
 * Parse assignment targets from UPDATE SET clause (field names only)
 */
function parseAssignmentFields(str: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  for (const ch of str) {
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    if (ch === "," && !inSingle && !inDouble) {
      const eqIdx = current.indexOf("=");
      if (eqIdx !== -1) fields.push(current.substring(0, eqIdx).trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) {
    const eqIdx = current.indexOf("=");
    if (eqIdx !== -1) fields.push(current.substring(0, eqIdx).trim());
  }
  return fields;
}

/**
 * Extract field references from a WebdaQL query string.
 * Returns the statement type and any field names that can be validated.
 */
export function extractFields(query: string): ParsedFields {
  const trimmed = query.trimStart();
  const upper = trimmed.toUpperCase();

  // DELETE WHERE ...
  if (upper.startsWith("DELETE")) {
    return { type: "DELETE" };
  }

  // UPDATE SET field = val, ... WHERE ...
  if (upper.startsWith("UPDATE")) {
    const afterUpdate = trimmed.substring(6).trimStart();
    if (!afterUpdate.toUpperCase().startsWith("SET")) {
      return { type: "UPDATE" };
    }
    const afterSet = afterUpdate.substring(3).trimStart();
    const whereIdx = findUnquotedKeyword(afterSet, "WHERE");
    const assignStr = whereIdx === -1 ? afterSet : afterSet.substring(0, whereIdx).trim();
    return {
      type: "UPDATE",
      assignmentFields: parseAssignmentFields(assignStr)
    };
  }

  // Explicit SELECT
  if (upper.startsWith("SELECT")) {
    const body = trimmed.substring(6).trimStart();
    return { type: "SELECT", fields: parseFieldList(body) };
  }

  // Plain filter query — no fields to validate
  return {};
}
