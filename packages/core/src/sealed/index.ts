/*
 * Wire formats (all binary is base64url without padding, every blob carries `v: 1`)
 *
 * Sealed value  SealedEnvelope { v, kid, epk, iv, ct }
 *   ECDH-ES P-256 with an ephemeral key `epk` (public JWK), HKDF-SHA-256 with salt = epkRaw(65) || recipientRaw(65)
 *   and info "webda-sealed-v1", AES-256-GCM over JSON(value).
 *   AAD = modelType|uuid|field|kid   (fieldAad)
 * Keyring       KeyringBlob { v, kid, iv, ct }
 *   AES-256-GCM (keyring key) over JSON({ keys: { kid: pkcs8 }, active }); `kid` is the active key.
 *   AAD = "webda-keyring|" + userId + "|" + kid + "|" + fingerprint(active public JWK)   (keyringAad)
 *   fingerprint = b64u(SHA-256(raw uncompressed point)); kid = first 16 characters of it.
 * Escrow        EscrowBlob { v, kind, kdf, kdfParams, salt, iv, ct }
 *   KEK = Argon2id { m, t, p } or PBKDF2-SHA-256 { iterations } (selected by `kdf`) from the secret and `salt`;
 *   ct = AES-256-GCM(KEK) over the raw 32-byte keyring key, AAD = "webda-escrow|" + userId + "|" + kind (escrowAad).
 *   Platform KEKs use AES-KW (wrapKeyringKeyKw), no AAD.
 * Recovery code 26 Crockford base32 characters (130 bits), displayed in groups of 5 and a final 1-character group
 *               (XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-X).
 */
export { b64u, concat, utf8 } from "./encoding.js";
export { KeyringPinError, SealedFormatError } from "./errors.js";
export {
  fieldAad,
  fingerprint,
  generateUserKeyPair,
  openValue,
  sealValue,
  type OpenRecipient,
  type PublicKeyEntry,
  type SealedEnvelope
} from "./ecdh.js";
export {
  createKeyringKey,
  decryptKeyring,
  encryptKeyring,
  keyringAad,
  unwrapKeyringKeyKw,
  wrapKeyringKeyKw,
  type Keyring,
  type KeyringBlob
} from "./keyring.js";
export {
  ARGON2_DEFAULTS,
  PBKDF2_DEFAULTS,
  createEscrowBlob,
  deriveKek,
  escrowAad,
  openEscrowBlob,
  unwrapKeyringKey,
  wrapKeyringKey,
  type Argon2Params,
  type EscrowBlob,
  type KdfName,
  type Pbkdf2Params
} from "./kdf.js";
export { assertRecoveryCode, generateRecoveryCode, normalizeRecoveryCode } from "./recovery.js";
