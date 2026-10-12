import crypto from "node:crypto";

/** Options controlling HOTP and TOTP generation */
export interface TotpOptions {
  /** Number of digits (6 or 8, default 6) */
  digits?: 6 | 8;
  /** Time step in seconds (default 30) */
  period?: number;
  /** HMAC hash algorithm (default "sha1") */
  algorithm?: "sha1" | "sha256" | "sha512";
}

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const BASE32_MAP = new Map<string, number>();
for (let i = 0; i < BASE32_ALPHABET.length; i++) {
  BASE32_MAP.set(BASE32_ALPHABET[i], i);
}

/**
 * Encode a buffer to an RFC 4648 Base32 string (without padding by default)
 * @param buf - input buffer
 * @param pad - whether to add trailing '=' padding
 * @returns Base32 encoded string
 */
export function base32Encode(buf: Buffer, pad: boolean = false): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  if (pad) {
    while (output.length % 8 !== 0) {
      output += "=";
    }
  }

  return output;
}

/**
 * Decode an RFC 4648 Base32 string to a Buffer
 * @param s - Base32 string (padding, whitespace, and hyphens ignored, case-insensitive)
 * @returns Decoded buffer
 */
export function base32Decode(s: string): Buffer {
  if (typeof s !== "string") {
    throw new Error("Invalid base32 input");
  }
  const clean = s.replace(/[\s\-=]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < clean.length; i++) {
    const val = BASE32_MAP.get(clean[i]);
    if (val === undefined) {
      throw new Error(`Invalid base32 character: ${clean[i]}`);
    }
    value = (value << 5) | val;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Generate a random Base32 secret for TOTP (no padding)
 * @param bytes - number of random bytes (default 20 = 160 bits)
 * @returns Base32 string
 */
export function generateTotpSecret(bytes: number = 20): string {
  return base32Encode(crypto.randomBytes(bytes), false);
}

/**
 * Compute an HMAC-based One-Time Password (RFC 4226)
 * @param secret - Base32 secret string or raw Buffer
 * @param counter - 64-bit integer counter
 * @param opts - options (digits, algorithm)
 * @returns numeric OTP code padded with leading zeroes
 */
export function hotp(secret: string | Buffer, counter: number, opts?: TotpOptions): string {
  let key: Buffer;
  if (Buffer.isBuffer(secret)) {
    key = secret;
  } else {
    try {
      key = base32Decode(secret);
    } catch {
      key = Buffer.from(secret, "utf-8");
    }
  }

  const digits = opts?.digits ?? 6;
  const algorithm = opts?.algorithm ?? "sha1";

  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));

  const hmac = crypto.createHmac(algorithm, key);
  hmac.update(buf);
  const digest = hmac.digest();

  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  const otp = binary % 10 ** digits;
  return otp.toString().padStart(digits, "0");
}

/**
 * Calculate the TOTP time step index for a given timestamp
 * @param now - timestamp (in ms if >= 1e11, or seconds if < 1e11; defaults to Date.now())
 * @param period - time step duration in seconds (default 30)
 * @returns time step index
 */
export function totpStep(now: number = Date.now(), period: number = 30): number {
  const ms = now < 1e11 ? now * 1000 : now;
  return Math.floor(ms / (period * 1000));
}

/**
 * Verify a TOTP code against a secret within an accepted time window
 * @param secret - Base32 secret string or raw Buffer
 * @param code - user-submitted OTP code
 * @param opts - options including window (±steps) and now
 * @returns the matched time step if valid, or undefined
 */
export function verifyTotp(
  secret: string | Buffer,
  code: string,
  opts?: TotpOptions & { window?: number; now?: number }
): number | undefined {
  if (typeof code !== "string") {
    return undefined;
  }
  const digits = opts?.digits ?? 6;
  const cleaned = code.trim();
  if (cleaned.length !== digits || !/^\d+$/.test(cleaned)) {
    return undefined;
  }

  const period = opts?.period ?? 30;
  const currentStep = totpStep(opts?.now, period);
  const window = opts?.window ?? 1;

  const codeBuf = Buffer.from(cleaned, "ascii");
  let matchedStep: number | undefined;

  for (let step = currentStep - window; step <= currentStep + window; step++) {
    if (step < 0) continue;
    const expected = hotp(secret, step, { ...opts, digits });
    const expectedBuf = Buffer.from(expected, "ascii");
    if (codeBuf.length === expectedBuf.length && crypto.timingSafeEqual(codeBuf, expectedBuf)) {
      matchedStep = step;
      break;
    }
  }

  return matchedStep;
}

/**
 * Build an otpauth:// URI for authenticator QR codes
 * @param opts - configuration with secret, issuer, account, and options
 * @returns otpauth://totp/... URI
 */
export function totpUri(opts: { secret: string; issuer: string; account: string } & TotpOptions): string {
  const issuer = opts.issuer.trim();
  const account = opts.account.trim();
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const query: string[] = [
    `secret=${encodeURIComponent(opts.secret)}`,
    `issuer=${encodeURIComponent(issuer)}`
  ];
  if (opts.algorithm && opts.algorithm !== "sha1") {
    query.push(`algorithm=${opts.algorithm.toUpperCase()}`);
  }
  if (opts.digits && opts.digits !== 6) {
    query.push(`digits=${opts.digits}`);
  }
  if (opts.period && opts.period !== 30) {
    query.push(`period=${opts.period}`);
  }
  return `otpauth://totp/${label}?${query.join("&")}`;
}
