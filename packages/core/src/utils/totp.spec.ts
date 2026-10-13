import { suite, test } from "@webda/test";
import * as assert from "assert";
import { base32Decode, base32Encode, generateTotpSecret, hotp, totpStep, totpUri, verifyTotp } from "./totp.js";

@suite
class TotpUtilTest {
  @test
  base32RoundTrip() {
    // Standard RFC 4648 test vectors
    const vectors: [string, string][] = [
      ["", ""],
      ["f", "MY"],
      ["fo", "MZXQ"],
      ["foo", "MZXW6"],
      ["foob", "MZXW6YQ"],
      ["fooba", "MZXW6YTB"],
      ["foobar", "MZXW6YTBOI"]
    ];

    for (const [ascii, expectedBase32] of vectors) {
      const encoded = base32Encode(Buffer.from(ascii, "ascii"));
      assert.strictEqual(encoded, expectedBase32);
      const decoded = base32Decode(expectedBase32);
      assert.strictEqual(decoded.toString("ascii"), ascii);
    }

    // Padded decode
    assert.strictEqual(base32Decode("MY======").toString("ascii"), "f");
    assert.strictEqual(base32Decode("MZXW6===").toString("ascii"), "foo");

    // Case-insensitive, ignores spaces and hyphens
    assert.strictEqual(base32Decode("mzxw-6ytb oi").toString("ascii"), "foobar");

    // Invalid character throws
    assert.throws(() => base32Decode("MZXW8"), /Invalid base32 character/);

    // Random round-trip
    for (let len = 1; len <= 64; len++) {
      const buf = Buffer.alloc(len);
      for (let i = 0; i < len; i++) buf[i] = (i * 37 + 13) & 0xff;
      const enc = base32Encode(buf);
      const dec = base32Decode(enc);
      assert.deepStrictEqual(dec, buf);
    }
  }

  @test
  generateSecret() {
    const secret = generateTotpSecret();
    assert.strictEqual(typeof secret, "string");
    // 20 bytes -> 32 base32 chars
    assert.strictEqual(secret.length, 32);
    assert.ok(/^[A-Z2-7]+$/.test(secret));

    const secret32 = generateTotpSecret(32);
    // 32 bytes -> Math.ceil(32 * 8 / 5) = 52 base32 chars (padded to 52 without padding =)
    assert.strictEqual(secret32.length, 52);
  }

  @test
  rfc4226HotpVectors() {
    // RFC 4226 Appendix D test vectors
    // Key: ASCII "12345678901234567890" (20 bytes)
    const secret = Buffer.from("12345678901234567890", "ascii");
    const expected = [
      "755224",
      "287082",
      "359152",
      "969429",
      "338314",
      "254676",
      "287922",
      "162583",
      "399871",
      "520489"
    ];

    for (let counter = 0; counter < expected.length; counter++) {
      const code = hotp(secret, counter, { digits: 6, algorithm: "sha1" });
      assert.strictEqual(code, expected[counter], `HOTP counter ${counter} failed`);
    }

    // Also with Base32 encoded secret string
    const base32Secret = base32Encode(secret);
    for (let counter = 0; counter < expected.length; counter++) {
      const code = hotp(base32Secret, counter, { digits: 6, algorithm: "sha1" });
      assert.strictEqual(code, expected[counter], `HOTP Base32 counter ${counter} failed`);
    }
  }

  @test
  rfc6238TotpVectors() {
    // RFC 6238 Appendix B test vectors
    // 8 digits, time step = 30 seconds
    const keySha1 = Buffer.from("12345678901234567890", "ascii");
    const keySha256 = Buffer.from("12345678901234567890123456789012", "ascii");
    const keySha512 = Buffer.from("1234567890123456789012345678901234567890123456789012345678901234", "ascii");

    const vectors = [
      { t: 59, sha1: "94287082", sha256: "46119246", sha512: "90693936" },
      { t: 1111111109, sha1: "07081804", sha256: "68084774", sha512: "25091201" },
      { t: 1111111111, sha1: "14050471", sha256: "67062674", sha512: "99943326" },
      { t: 1234567890, sha1: "89005924", sha256: "91819424", sha512: "93441116" },
      { t: 2000000000, sha1: "69279037", sha256: "90698825", sha512: "38618901" },
      { t: 20000000000, sha1: "65353130", sha256: "77737706", sha512: "47863826" }
    ];

    for (const v of vectors) {
      const step = totpStep(v.t, 30);
      assert.strictEqual(hotp(keySha1, step, { digits: 8, algorithm: "sha1" }), v.sha1);
      assert.strictEqual(hotp(keySha256, step, { digits: 8, algorithm: "sha256" }), v.sha256);
      assert.strictEqual(hotp(keySha512, step, { digits: 8, algorithm: "sha512" }), v.sha512);

      // verifyTotp at exact time
      assert.strictEqual(verifyTotp(keySha1, v.sha1, { digits: 8, algorithm: "sha1", now: v.t, window: 0 }), step);
      assert.strictEqual(
        verifyTotp(keySha256, v.sha256, { digits: 8, algorithm: "sha256", now: v.t, window: 0 }),
        step
      );
      assert.strictEqual(
        verifyTotp(keySha512, v.sha512, { digits: 8, algorithm: "sha512", now: v.t, window: 0 }),
        step
      );
    }
  }

  @test
  totpWindowEdges() {
    const secret = generateTotpSecret();
    const period = 30;
    const now = 1000000;
    const currentStep = totpStep(now, period);

    const prevCode = hotp(secret, currentStep - 1);
    const currCode = hotp(secret, currentStep);
    const nextCode = hotp(secret, currentStep + 1);
    const farCode = hotp(secret, currentStep + 2);

    // Window 0 accepts current only
    assert.strictEqual(verifyTotp(secret, currCode, { now, window: 0 }), currentStep);
    assert.strictEqual(verifyTotp(secret, prevCode, { now, window: 0 }), undefined);
    assert.strictEqual(verifyTotp(secret, nextCode, { now, window: 0 }), undefined);

    // Window 1 accepts -1, 0, +1
    assert.strictEqual(verifyTotp(secret, currCode, { now, window: 1 }), currentStep);
    assert.strictEqual(verifyTotp(secret, prevCode, { now, window: 1 }), currentStep - 1);
    assert.strictEqual(verifyTotp(secret, nextCode, { now, window: 1 }), currentStep + 1);
    assert.strictEqual(verifyTotp(secret, farCode, { now, window: 1 }), undefined);

    // Invalid codes
    assert.strictEqual(verifyTotp(secret, "abcdef", { now }), undefined);
    assert.strictEqual(verifyTotp(secret, "12345", { now }), undefined); // wrong length
    assert.strictEqual(verifyTotp(secret, "1234567", { now }), undefined);
    assert.strictEqual(verifyTotp(secret, "000000", { now }), undefined);
  }

  @test
  totpUriFormat() {
    const uri = totpUri({
      secret: "JBSWY3DPEHPK3PXP",
      issuer: "Acme Corp",
      account: "alice@example.com"
    });

    assert.strictEqual(
      uri,
      "otpauth://totp/Acme%20Corp:alice%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Acme%20Corp"
    );

    // With custom algorithm, digits, and period
    const customUri = totpUri({
      secret: "JBSWY3DPEHPK3PXP",
      issuer: "Acme",
      account: "bob",
      algorithm: "sha256",
      digits: 8,
      period: 60
    });

    assert.strictEqual(
      customUri,
      "otpauth://totp/Acme:bob?secret=JBSWY3DPEHPK3PXP&issuer=Acme&algorithm=SHA256&digits=8&period=60"
    );
  }

  @test
  totpEdgeCases() {
    // base32Encode with padding
    assert.strictEqual(base32Encode(Buffer.from("f"), true), "MY======");
    assert.strictEqual(base32Encode(Buffer.from("fo"), true), "MZXQ====");
    assert.strictEqual(base32Encode(Buffer.from("foo"), true), "MZXW6===");
    assert.strictEqual(base32Encode(Buffer.from("foob"), true), "MZXW6YQ=");

    // base32Decode non-string error
    assert.throws(() => base32Decode(123 as any), /Invalid base32 input/);

    // hotp fallback with non-base32 string
    const fallbackCode = hotp("not-valid-base32!", 1);
    assert.ok(/^\d{6}$/.test(fallbackCode));

    // verifyTotp non-string code
    assert.strictEqual(verifyTotp("JBSWY3DPEHPK3PXP", null as any), undefined);
    assert.strictEqual(verifyTotp("JBSWY3DPEHPK3PXP", undefined as any), undefined);

    // verifyTotp with timestamp close to 0 where step - window < 0
    assert.strictEqual(verifyTotp("JBSWY3DPEHPK3PXP", "123456", { now: 10, window: 5 }), undefined);
  }
}
