import { getUuid } from "@webda/utils";
import { useCrypto } from "@webda/core";
import { TokenExpired, TokenInvalid } from "../errors.js";

/** What an emailed link is for */
export type EmailTokenPurpose = "register" | "verify" | "recover";

/** Claims of an emailed token */
export interface EmailTokenClaims {
  purpose: EmailTokenPurpose;
  email: string;
  sub?: string;
  pwdAt?: number;
  jti: string;
}

/** Default lifetimes in seconds */
export const EMAIL_TOKEN_TTL: Record<EmailTokenPurpose, number> = { register: 86400, verify: 86400, recover: 3600 };
const AUDIENCE = "webda-email";

/**
 * Sign a purpose-scoped emailed token
 * @param purpose - purpose
 * @param claims - email, user and password timestamp
 * @param claims.email - email of the token
 * @param claims.sub - user id
 * @param claims.pwdAt - password change timestamp
 * @param ttl - lifetime in seconds
 * @returns signed token
 */
export async function signEmailToken(
  purpose: EmailTokenPurpose,
  claims: { email: string; sub?: string; pwdAt?: number },
  ttl: number = EMAIL_TOKEN_TTL[purpose]
): Promise<string> {
  return useCrypto().jwtSign({ ...claims, purpose, jti: getUuid("base64") }, { audience: AUDIENCE, expiresIn: ttl });
}

/**
 * Verify an emailed token
 * @param token - token from the link
 * @param purpose - expected purpose
 * @returns claims
 * @throws TokenExpired if expired, TokenInvalid for any other problem
 */
export async function verifyEmailToken(token: string, purpose: EmailTokenPurpose): Promise<EmailTokenClaims> {
  if (typeof token !== "string") {
    throw new TokenInvalid();
  }
  let claims: any;
  try {
    claims = await useCrypto().jwtVerify(token, { audience: AUDIENCE });
  } catch (err) {
    if (err?.name === "TokenExpiredError") {
      throw new TokenExpired();
    }
    throw new TokenInvalid();
  }
  if (!claims || typeof claims !== "object" || claims.purpose !== purpose || typeof claims.email !== "string") {
    throw new TokenInvalid();
  }
  return claims;
}
