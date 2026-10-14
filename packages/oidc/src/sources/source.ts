import * as jose from "jose";
import { OIDCTokenSourceError } from "../errors.js";

/**
 * A token obtained from a source
 */
export interface SourcedToken {
  /**
   * The JWT
   */
  token: string;
  /**
   * Expiration timestamp in milliseconds
   */
  expiresAt: number;
}

/**
 * Provide workload tokens for an audience
 */
export interface TokenSource {
  /**
   * @param audience - the target audience
   * @returns a token for this audience
   */
  getToken(audience: string): Promise<SourcedToken>;
}

/**
 * Read the expiration of an external token, without verifying it: the callee does
 * @param token - the JWT
 * @returns the token with its expiration
 * @throws OIDCTokenSourceError when the token is not a JWT with an `exp`
 */
export function toSourcedToken(token: string): SourcedToken {
  token = token?.trim();
  let exp: unknown;
  try {
    exp = jose.decodeJwt(token).exp;
  } catch {
    throw new OIDCTokenSourceError("The token source did not return a JWT");
  }
  if (typeof exp !== "number") {
    throw new OIDCTokenSourceError("The token source returned a JWT without exp");
  }
  return { token, expiresAt: exp * 1000 };
}

/**
 * Fetch a token over HTTP
 * @param url - the url
 * @param init - the request options
 * @param read - extract the token from the response
 * @param timeout - timeout in milliseconds
 * @returns the token
 */
export async function fetchToken(
  url: string,
  init: RequestInit,
  read: (res: Response) => Promise<string>,
  timeout: number
): Promise<SourcedToken> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeout) });
  } catch (err: any) {
    throw new OIDCTokenSourceError(`Token request failed: ${err?.message}`);
  }
  if (!res.ok) {
    throw new OIDCTokenSourceError(`Token request returned HTTP ${res.status}`);
  }
  return toSourcedToken(await read(res));
}
