import { createHash, randomBytes, randomInt } from "node:crypto";

const ALPHABET = "BCDFGHJKLMNPQRSTVWXZ";

/** @returns a random 8-character user code */
export function generateUserCode(): string {
  return Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}

/**
 * @param code - user code
 * @returns `XXXX-XXXX`
 */
export function formatUserCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/**
 * @param input - typed code
 * @returns the canonical code, undefined when malformed
 */
export function normalizeUserCode(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined;
  const code = input.toUpperCase().replace(/[\s-]/g, "");
  return /^[BCDFGHJKLMNPQRSTVWXZ]{8}$/.test(code) ? code : undefined;
}

/**
 * @param deviceCode - device_code
 * @returns its parts
 */
export function splitDeviceCode(deviceCode: unknown): { userCode: string; secret: string } | undefined {
  if (typeof deviceCode !== "string") return undefined;
  const match = /^([BCDFGHJKLMNPQRSTVWXZ]{8})\.([A-Za-z0-9_-]{1,128})$/.exec(deviceCode);
  return match ? { userCode: match[1], secret: match[2] } : undefined;
}

/**
 * @param value - value
 * @returns SHA-256 hex
 */
export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * @param bytes - entropy
 * @returns base64url random token
 */
export function randomToken(bytes: number = 32): string {
  return randomBytes(bytes).toString("base64url");
}
