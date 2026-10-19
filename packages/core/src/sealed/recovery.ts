import { SealedFormatError } from "./errors.js";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const RECOVERY_CHARS = 26; // 26 * 5 bits = 130 bits

/**
 * Random recovery code: 26 Crockford base32 characters (130 bits) in groups of 5 joined by "-"
 * @returns the code
 */
export function generateRecoveryCode(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(RECOVERY_CHARS));
  // 32 symbols and 256 values: `& 31` is unbiased
  const chars = Array.from(bytes, b => CROCKFORD[b & 31]).join("");
  return chars.match(/.{1,5}/g)!.join("-");
}

/**
 * Normalize user input: uppercase, drop spaces and dashes, map the ambiguous O to 0 and I/L to 1
 * @param input - code as typed by the user
 * @returns the canonical code, without separators
 */
export function normalizeRecoveryCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s-]+/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
}

/**
 * Normalize and validate a recovery code
 * @param input - code as typed by the user
 * @returns the canonical code (26 Crockford characters)
 */
export function assertRecoveryCode(input: string): string {
  const code = normalizeRecoveryCode(input);
  if (code.length !== RECOVERY_CHARS || ![...code].every(c => CROCKFORD.includes(c))) {
    throw new SealedFormatError(`Recovery code must be ${RECOVERY_CHARS} Crockford base32 characters`);
  }
  return code;
}
