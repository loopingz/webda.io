import { suite, test } from "@webda/test";
import * as assert from "assert";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  KeyringPinError,
  SealedFormatError,
  b64u,
  createEscrowBlob,
  createKeyringKey,
  decryptKeyring,
  deriveKek,
  encryptKeyring,
  fieldAad,
  fingerprint,
  assertRecoveryCode,
  generateRecoveryCode,
  generateUserKeyPair,
  keyringAad,
  normalizeRecoveryCode,
  openEscrowBlob,
  openValue,
  sealValue,
  unwrapKeyringKey,
  unwrapKeyringKeyKw,
  wrapKeyringKey,
  wrapKeyringKeyKw,
  type Keyring,
  type SealedEnvelope
} from "./index.js";
import { sealWith } from "./ecdh.js";
import { aeadEncrypt, importAesKey } from "./aead.js";
import { utf8 } from "./encoding.js";

const dir = dirname(fileURLToPath(import.meta.url));
const rejects = (p: Promise<unknown>, ctor?: new (...a: any[]) => Error) =>
  assert.rejects(p, ctor ? (e: unknown) => e instanceof ctor : undefined);

async function newUser() {
  const pair = await generateUserKeyPair();
  return { ...pair, recipient: { kid: pair.kid, jwk: pair.publicJwk } };
}

async function keyringFor(...users: Awaited<ReturnType<typeof newUser>>[]): Promise<Keyring> {
  const keys: Record<string, string> = {};
  for (const u of users) {
    keys[u.kid] = b64u.encode(new Uint8Array(await crypto.subtle.exportKey("pkcs8", u.privateKey)));
  }
  return { keys, active: users[users.length - 1].kid };
}

@suite
class SealedTest {
  @test
  async sealOpenRoundTrip() {
    const u = await newUser();
    assert.strictEqual(u.kid, (await fingerprint(u.publicJwk)).substring(0, 16));
    assert.strictEqual(u.publicJwk.d, undefined);
    const aad = fieldAad("Note", "uuid-1", "content", u.kid);
    assert.strictEqual(aad, "Note|uuid-1|content|" + u.kid);
    const value = { title: "héllo", n: [1, 2, { x: null }] };
    const env = await sealValue(value, u.recipient, aad);
    assert.strictEqual(env.v, 1);
    assert.strictEqual(env.kid, u.kid);
    assert.ok(!JSON.stringify(env).includes("héllo"));
    assert.deepStrictEqual(await openValue(env, u, aad), value);
    // Fresh ephemeral key and IV each time
    const env2 = await sealValue(value, u.recipient, aad);
    assert.notStrictEqual(env2.ct, env.ct);
    assert.notDeepStrictEqual(env2.epk, env.epk);
    // Envelope survives JSON serialization
    assert.deepStrictEqual(await openValue(JSON.parse(JSON.stringify(env)), u, aad), value);
  }

  @test
  async aadBindsRecordFieldKid() {
    const u = await newUser();
    const env = await sealValue("secret", u.recipient, fieldAad("Note", "u1", "content", u.kid));
    for (const aad of [
      fieldAad("Note", "u2", "content", u.kid),
      fieldAad("Note", "u1", "other", u.kid),
      fieldAad("Note", "u1", "content", "otherkid"),
      fieldAad("Other", "u1", "content", u.kid)
    ]) {
      await rejects(openValue(env, u, aad));
    }
  }

  @test
  async wrongKeyRejected() {
    const a = await newUser();
    const b = await newUser();
    const aad = fieldAad("Note", "u1", "content", a.kid);
    await rejects(openValue(await sealValue("x", a.recipient, aad), b, aad));
  }

  @test
  async versionChecked() {
    const u = await newUser();
    const aad = fieldAad("Note", "u1", "content", u.kid);
    const env = await sealValue("x", u.recipient, aad);
    await rejects(openValue({ ...env, v: 2 } as unknown as SealedEnvelope, u, aad), SealedFormatError);
    await rejects(openValue({ ...env, iv: "!!" }, u, aad), SealedFormatError);
    await rejects(openValue({ ...env, epk: undefined } as any, u, aad), SealedFormatError);
    await rejects(openValue(null as any, u, aad), SealedFormatError);
    const keyring = await keyringFor(u);
    const blob = await encryptKeyring(keyring, await createKeyringKey(), "user", [u.recipient]);
    await rejects(
      decryptKeyring({ ...blob, v: 2 } as any, await createKeyringKey(), "user", [u.recipient]),
      SealedFormatError
    );
  }

  @test
  async malformedInputsRejected() {
    const u = await newUser();
    const aad = fieldAad("Note", "u1", "content", u.kid);
    const env = await sealValue("x", u.recipient, aad);
    // Ephemeral key present but not a P-256 point, truncated IV
    await rejects(openValue({ ...env, epk: { kty: "EC" } }, u, aad), SealedFormatError);
    await assert.rejects(openValue({ ...env, iv: b64u.encode(new Uint8Array(8)) }, u, aad), /Truncated/);
    // Keyring: active kid without a public key, malformed blob, truncated IV
    const key = await createKeyringKey();
    const keyring = await keyringFor(u);
    await rejects(encryptKeyring(keyring, key, "user", []), KeyringPinError);
    const blob = await encryptKeyring(keyring, key, "user", [u.recipient]);
    await rejects(decryptKeyring({ ...blob, kid: 1 } as any, key, "user", [u.recipient]), SealedFormatError);
    await rejects(
      decryptKeyring({ ...blob, iv: b64u.encode(new Uint8Array(8)) }, key, "user", [u.recipient]),
      SealedFormatError
    );
    // Authenticated plaintext that is not a keyring
    const keyringAadOf = async (kid: string) => keyringAad("user", kid, await fingerprint(u.publicJwk));
    const forge = async (plain: string) => ({
      v: 1 as const,
      kid: u.kid,
      ...(await aeadEncrypt(key, utf8(plain), await keyringAadOf(u.kid)))
    });
    await assert.rejects(decryptKeyring(await forge("not json"), key, "user", [u.recipient]), /not valid JSON/);
    for (const plain of [
      "null",
      JSON.stringify({ active: u.kid }),
      JSON.stringify({ keys: null, active: u.kid }),
      JSON.stringify({ keys: {}, active: u.kid })
    ]) {
      await assert.rejects(decryptKeyring(await forge(plain), key, "user", [u.recipient]), /Malformed keyring/);
    }
    // Keyring active kid differs from the blob kid it is authenticated under
    const other = await newUser();
    const both = await keyringFor(u, other);
    await assert.rejects(
      decryptKeyring(await forge(JSON.stringify({ ...both, active: other.kid })), key, "user", [
        u.recipient,
        other.recipient
      ]),
      /differs/
    );
    // Escrow: unknown kind, missing kdfParams, wrapped key of the wrong length
    const escrow = await createEscrowBlob("password", "pw", key, "user", "pbkdf2-sha256");
    await rejects(openEscrowBlob({ ...escrow, kind: "device" } as any, "pw", "user"), SealedFormatError);
    await rejects(openEscrowBlob({ ...escrow, kdfParams: undefined } as any, "pw", "user"), SealedFormatError);
    const kek = await deriveKek("pw", crypto.getRandomValues(new Uint8Array(16)), "pbkdf2-sha256", {
      iterations: 100000
    });
    await assert.rejects(
      unwrapKeyringKey(await aeadEncrypt(kek, new Uint8Array(16), "aad"), kek, "aad"),
      /Unexpected keyring key length/
    );
  }

  @test
  async keyringRoundTripAndPin() {
    const a = await newUser();
    const b = await newUser();
    const keyring = await keyringFor(a, b);
    const key = await createKeyringKey();
    assert.ok(key.extractable);
    const pubs = [a.recipient, b.recipient];
    const blob = await encryptKeyring(keyring, key, "user-1", pubs);
    assert.strictEqual(blob.v, 1);
    const dec = await decryptKeyring(blob, key, "user-1", pubs);
    assert.deepStrictEqual(dec.keyring, keyring);
    assert.deepStrictEqual(Object.keys(dec.privateKeys).sort(), [a.kid, b.kid].sort());
    // Private keys decrypt values sealed to the matching public keys
    for (const u of [a, b]) {
      const aad = fieldAad("Note", "u", "f", u.kid);
      assert.strictEqual(await openValue(await sealValue("v", u.recipient, aad), dec.privateKeys[u.kid], aad), "v");
    }
    assert.strictEqual(
      keyringAad("user-1", b.kid, await fingerprint(b.publicJwk)),
      `webda-keyring|user-1|${b.kid}|${await fingerprint(b.publicJwk)}`
    );
    // Wrong user: AAD mismatch
    await rejects(decryptKeyring(blob, key, "user-2", pubs));
    // Served active public key replaced by another pair's: pin failure
    const evil = await newUser();
    await rejects(
      decryptKeyring(blob, key, "user-1", [a.recipient, { kid: b.kid, jwk: evil.publicJwk }]),
      KeyringPinError
    );
    // Non-active key replaced: AAD still matches, per-key check catches it
    await rejects(
      decryptKeyring(blob, key, "user-1", [{ kid: a.kid, jwk: evil.publicJwk }, b.recipient]),
      KeyringPinError
    );
    // AEAD failure on the declared kid has its own message
    await assert.rejects(decryptKeyring(blob, key, "user-2", pubs), /authentication failed/);
    await assert.rejects(decryptKeyring(blob, key, "user-1", [a.recipient]), /No public key served/);
    // Missing public key for a kid
    await rejects(decryptKeyring(blob, key, "user-1", [b.recipient]), KeyringPinError);
  }

  @test
  async escrowPasswordAndRecovery() {
    const key = await createKeyringKey();
    const raw = new Uint8Array(await crypto.subtle.exportKey("raw", key));
    const cases = [
      { kind: "password", kdf: "argon2id" },
      { kind: "recovery", kdf: "argon2id" },
      { kind: "password", kdf: "pbkdf2-sha256" }
    ] as const;
    for (const c of cases) {
      const secret = c.kind === "recovery" ? generateRecoveryCode() : "correct horse battery staple";
      const blob = await createEscrowBlob(c.kind, secret, key, "user-1", c.kdf);
      assert.strictEqual(blob.v, 1);
      assert.strictEqual(blob.kind, c.kind);
      assert.strictEqual(blob.kdf, c.kdf);
      assert.strictEqual(b64u.decode(blob.salt).length, 16);
      if (c.kdf === "argon2id") {
        assert.deepStrictEqual(blob.kdfParams, { m: 65536, t: 3, p: 1 });
      } else {
        assert.deepStrictEqual(blob.kdfParams, { iterations: 600000 });
      }
      const opened = await openEscrowBlob(JSON.parse(JSON.stringify(blob)), secret, "user-1");
      assert.deepStrictEqual(new Uint8Array(await crypto.subtle.exportKey("raw", opened)), raw);
      await rejects(openEscrowBlob(blob, secret + "x", "user-1"));
      await rejects(openEscrowBlob(blob, secret, "user-2"));
    }
    // Recovery code is accepted in any normalized spelling
    const code = generateRecoveryCode();
    const blob = await createEscrowBlob("recovery", code, key, "u", "pbkdf2-sha256");
    await openEscrowBlob(blob, code.toLowerCase().replace(/-/g, " "), "u");
    await rejects(createEscrowBlob("recovery", "short", key, "u", "pbkdf2-sha256"), SealedFormatError);
    // kdf selects the algorithm: same secret and salt give different keys across kdfs
    await rejects(openEscrowBlob({ ...blob, kdf: "argon2id", kdfParams: { m: 1024, t: 1, p: 1 } }, code, "u"));
    await rejects(openEscrowBlob({ ...blob, kdf: "scrypt" } as any, code, "u"), SealedFormatError);
    await rejects(openEscrowBlob({ ...blob, v: 2 } as any, code, "u"), SealedFormatError);
  }

  @test
  async kdfKekWrapPrimitives() {
    const key = await createKeyringKey();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const kek = await deriveKek("pw", salt, "pbkdf2-sha256", { iterations: 100000 });
    assert.strictEqual(kek.algorithm.name, "AES-GCM");
    const kekArgon = await deriveKek("pw", salt, "argon2id", { m: 1024, t: 1, p: 1 });
    assert.strictEqual(kekArgon.algorithm.name, "AES-GCM");
    const wrapped = await wrapKeyringKey(key, kek, "aad");
    const out = await unwrapKeyringKey(wrapped, kek, "aad");
    assert.ok(out.extractable);
    assert.deepStrictEqual(
      new Uint8Array(await crypto.subtle.exportKey("raw", out)),
      new Uint8Array(await crypto.subtle.exportKey("raw", key))
    );
    await rejects(unwrapKeyringKey(wrapped, kek, "other"));
    await rejects(unwrapKeyringKey(wrapped, kekArgon, "aad"));
  }

  @test
  async kwWrap() {
    const key = await createKeyringKey();
    const kek = await crypto.subtle.generateKey({ name: "AES-KW", length: 256 }, false, ["wrapKey", "unwrapKey"]);
    const wrapped = await wrapKeyringKeyKw(key, kek);
    assert.strictEqual(b64u.decode(wrapped).length, 40);
    const out = await unwrapKeyringKeyKw(wrapped, kek);
    assert.ok(out.extractable);
    assert.deepStrictEqual(
      new Uint8Array(await crypto.subtle.exportKey("raw", out)),
      new Uint8Array(await crypto.subtle.exportKey("raw", key))
    );
    const other = await crypto.subtle.generateKey({ name: "AES-KW", length: 256 }, false, ["wrapKey", "unwrapKey"]);
    await rejects(unwrapKeyringKeyKw(wrapped, other));
    // Unwrapped key is usable for the keyring blob
    const u = await newUser();
    const blob = await encryptKeyring(await keyringFor(u), key, "u", [u.recipient]);
    await decryptKeyring(blob, out, "u", [u.recipient]);
  }

  @test
  async openWithIndependentNonExtractableKey() {
    const u = await newUser();
    const aad = fieldAad("Note", "u1", "content", u.kid);
    const env = await sealValue({ a: 1 }, u.recipient, aad);
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", u.privateKey));
    const privateKey = await crypto.subtle.importKey("pkcs8", pkcs8, { name: "ECDH", namedCurve: "P-256" }, false, [
      "deriveBits"
    ]);
    assert.strictEqual(privateKey.extractable, false);
    assert.deepStrictEqual(await openValue(env, { privateKey, publicJwk: u.publicJwk }, aad), { a: 1 });
    // The public key must be supplied, and must be the right one
    await rejects(openValue(env, { privateKey } as any, aad), SealedFormatError);
    await rejects(openValue(env, { privateKey, publicJwk: { kty: "EC" } }, aad), SealedFormatError);
    await rejects(openValue(env, { privateKey, publicJwk: (await newUser()).publicJwk }, aad));
    // Keyring private keys carry their public key and need no hidden state
    const key = await createKeyringKey();
    const blob = await encryptKeyring(await keyringFor(u), key, "u", [u.recipient]);
    assert.strictEqual(blob.kid, u.kid);
    const dec = await decryptKeyring(blob, key, "u", [u.recipient]);
    assert.strictEqual(dec.privateKeys[u.kid].privateKey.extractable, false);
    assert.deepStrictEqual(dec.privateKeys[u.kid].publicJwk, u.publicJwk);
  }

  @test
  async kdfParamsClamped() {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    for (const [kdf, params] of [
      ["argon2id", { m: 262145, t: 3, p: 1 }],
      ["argon2id", { m: 65536, t: 11, p: 1 }],
      ["argon2id", { m: 65536, t: 3, p: 5 }],
      ["argon2id", { m: 65536, t: 0, p: 1 }],
      ["argon2id", {}],
      ["pbkdf2-sha256", { iterations: 99999 }],
      ["pbkdf2-sha256", { iterations: 2000001 }],
      ["pbkdf2-sha256", { iterations: "600000" }]
    ] as const) {
      await rejects(deriveKek("pw", salt, kdf, params), SealedFormatError);
    }
  }

  @test
  recoveryCodeValidation() {
    const code = generateRecoveryCode();
    assert.strictEqual(assertRecoveryCode(code.toLowerCase()), code.replace(/-/g, ""));
    for (const bad of ["", "ABC", code + "A", code.replace(/.$/, "U") + "U", "!".repeat(26)]) {
      assert.throws(() => assertRecoveryCode(bad), SealedFormatError);
    }
  }

  @test
  recoveryCodeFormat() {
    for (let i = 0; i < 50; i++) {
      const code = generateRecoveryCode();
      assert.match(
        code,
        /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{5}(-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{5}){4}-[0-9ABCDEFGHJKMNPQRSTVWXYZ]$/
      );
      assert.strictEqual(normalizeRecoveryCode(code).length, 26);
      assert.strictEqual(normalizeRecoveryCode(code), code.replace(/-/g, ""));
    }
    assert.notStrictEqual(generateRecoveryCode(), generateRecoveryCode());
    assert.strictEqual(normalizeRecoveryCode(" ab-cO ilL1 u"), "ABC01111U");
  }

  @test
  async vectors() {
    const v = JSON.parse(readFileSync(join(dir, "vectors.json"), "utf8"));
    const ec = { name: "ECDH", namedCurve: "P-256" } as const;
    const strip = ({ d: _d, ...pub }: JsonWebKey) => pub;
    const pair = async (priv: JsonWebKey, pub: JsonWebKey): Promise<CryptoKeyPair> => ({
      privateKey: await crypto.subtle.importKey("jwk", priv, ec, true, ["deriveBits"]),
      publicKey: await crypto.subtle.importKey("jwk", strip(pub), ec, true, [])
    });
    // AAD strings
    assert.strictEqual(fieldAad("Note", "u1", "content", "kid1"), v.aad.field);
    assert.strictEqual(keyringAad("user-1", "kid1", "FP"), v.aad.keyring);
    // Seal envelope
    const s = v.seal;
    assert.strictEqual(await fingerprint(s.recipientPublicJwk), s.recipientFingerprint);
    const eph = await pair(s.ephemeralPrivateJwk, s.ephemeralPublicJwk);
    const env = await sealWith(eph, b64u.decode(s.iv), { kid: s.kid, jwk: s.recipientPublicJwk }, s.value, s.aad);
    assert.deepStrictEqual(env, s.envelope);
    const recipient = await pair(s.recipientPrivateJwk, s.recipientPublicJwk);
    assert.deepStrictEqual(
      await openValue(s.envelope, { privateKey: recipient.privateKey, publicJwk: s.recipientPublicJwk }, s.aad),
      s.value
    );
    // KDF-derived KEKs open frozen wrapped keyring keys
    for (const k of [v.argon2id, v.pbkdf2]) {
      const kek = await deriveKek(k.secret, b64u.decode(k.salt), k.kdf, k.kdfParams);
      const out = await unwrapKeyringKey(k.wrapped, kek, k.aad);
      assert.strictEqual(b64u.encode(new Uint8Array(await crypto.subtle.exportKey("raw", out))), k.keyringKey);
    }
    // Frozen keyring blob
    const kk = await importAesKey(b64u.decode(v.keyring.keyringKey), true);
    const dec = await decryptKeyring(v.keyring.blob, kk, v.keyring.userId, [
      { kid: v.keyring.kid, jwk: v.keyring.publicJwk }
    ]);
    assert.deepStrictEqual(dec.keyring, v.keyring.keyring);
  }

  @test
  isomorphicImports() {
    const files = readdirSync(dir).filter(f => f.endsWith(".ts") && !f.endsWith(".spec.ts"));
    assert.ok(files.length >= 8);
    for (const f of files) {
      const src = readFileSync(join(dir, f), "utf8");
      const specs = [...src.matchAll(/(?:^|\n)\s*(?:import|export)\b[^;]*?\sfrom\s+["']([^"']+)["']/g)].map(m => m[1]);
      specs.push(
        ...[...src.matchAll(/import\(\s*["']([^"']+)["']\s*\)|require\(\s*["']([^"']+)["']\s*\)/g)].map(
          m => m[1] ?? m[2]
        )
      );
      for (const s of specs) {
        assert.ok(s.startsWith("./") || s === "hash-wasm", `${f} imports ${s}`);
      }
      assert.ok(
        !/node:|(?<![A-Za-z])Buffer\b/.test(src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")),
        `${f} uses a node API`
      );
    }
  }
}
