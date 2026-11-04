// Compiled only by tsconfig.sealed-dom.json (lib "dom"): proves DOM WebCrypto values are accepted by the sealed API.
import { openValue, sealValue, type PublicKeyEntry, type SealedEnvelope } from "./index.js";

declare const domJwk: JsonWebKey;
declare const domKey: CryptoKey;
declare const domPair: CryptoKeyPair;

const recipient: PublicKeyEntry = { kid: "kid", jwk: domJwk };
export const sealed: Promise<SealedEnvelope> = sealValue("v", recipient, "aad");
export const opened = openValue(sealed as unknown as SealedEnvelope, { privateKey: domKey, publicJwk: domJwk }, "aad");
export const fromPair = openValue({} as SealedEnvelope, { privateKey: domPair.privateKey, publicJwk: domJwk }, "aad");
// The envelope public key is assignable back to the DOM type
export const back: JsonWebKey = ({} as SealedEnvelope).epk;
