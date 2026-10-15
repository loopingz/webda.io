import { globMatch } from "@webda/utils";
import * as WebdaError from "../errors/errors.js";

/** Normalized scope: de-duplicated tokens, in first-seen order */
export type Scope = string[];

/** Scope token requesting a refresh token */
export const OFFLINE_ACCESS = "offline_access";

const TOKEN = /^[A-Za-z0-9.*]{1,1024}$/;

/** Invalid scope (RFC 6749 `invalid_scope`) */
export class InvalidScope extends WebdaError.BadRequest {
  /** OAuth error code */
  code = "invalid_scope";
}

/**
 * @param raw - space-separated scope
 * @returns normalized scope
 * @throws InvalidScope on an unknown token
 */
export function parseScope(raw: string | undefined): Scope {
  const tokens = (raw ?? "").split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    if (token !== OFFLINE_ACCESS && (!TOKEN.test(token) || !/[A-Z*]/.test(token[0]))) {
      throw new InvalidScope(`Invalid scope token '${token.slice(0, 64)}'`);
    }
  }
  return [...new Set(tokens)];
}

/**
 * @param scope - scope
 * @returns space-separated scope
 */
export function formatScope(scope: Scope): string {
  return scope.join(" ");
}

/**
 * @param scope - scope
 * @returns its operation globs
 */
export function operationGlobs(scope: Scope): string[] {
  return scope.filter(t => t !== OFFLINE_ACCESS);
}

/**
 * @param scope - granted scope
 * @param operationId - operation
 * @returns true when a glob of the scope matches the operation
 */
export function scopeMatches(scope: Scope, operationId: string): boolean {
  return operationGlobs(scope).some(glob => globMatch(operationId, glob));
}

/**
 * Whether one token is covered by a scope. The requested `*` are replaced by a NUL, a character no literal can
 * match, so only a granted `*` can absorb them: the token is covered exactly when every expansion of its `*` is
 * @param granted - granted scope
 * @param token - requested token
 * @returns true when covered
 */
function coversToken(granted: Scope, token: string): boolean {
  if (token === OFFLINE_ACCESS) return granted.includes(OFFLINE_ACCESS);
  const probe = token.replaceAll("*", "\0");
  return operationGlobs(granted).some(glob => globMatch(probe, glob));
}

/**
 * @param granted - granted scope
 * @param requested - requested scope
 * @returns true when every requested token is covered
 */
export function covers(granted: Scope, requested: Scope): boolean {
  return requested.every(token => coversToken(granted, token));
}

/**
 * @param a - scope
 * @param b - scope
 * @returns the tokens of either scope covered by both
 */
export function intersect(a: Scope, b: Scope): Scope {
  const result: string[] = [];
  for (const token of [...a, ...b]) {
    if (!result.includes(token) && coversToken(a, token) && coversToken(b, token)) result.push(token);
  }
  // offline_access is a flag, not an operation glob: keep it last
  return [...result.filter(t => t !== OFFLINE_ACCESS), ...result.filter(t => t === OFFLINE_ACCESS)];
}

/**
 * @param globs - scope
 * @param operationIds - known operations
 * @returns the operations matched by the scope, in `operationIds` order
 */
export function expand(globs: Scope, operationIds: string[]): string[] {
  return operationIds.filter(id => scopeMatches(globs, id));
}

/**
 * Turn a selection of operations back into a scope: a requested glob whose operations are all selected is kept as a
 * glob (operations added later stay covered); otherwise the selected ids are listed. Never widens the request.
 * @param selected - selected operation ids
 * @param requested - requested scope
 * @param operationIds - operations the user may call
 * @returns scope (without `offline_access`)
 */
export function collapse(selected: string[], requested: Scope, operationIds: string[]): Scope {
  const chosen = selected.filter(id => scopeMatches(requested, id));
  const result = new Set<string>();
  for (const id of chosen) {
    const glob = operationGlobs(requested).find(g => {
      if (!globMatch(id, g)) return false;
      const matched = expand([g], operationIds);
      return matched.length > 0 && matched.every(op => chosen.includes(op));
    });
    result.add(glob ?? id);
  }
  return [...result];
}
