import { suite, test } from "@webda/test";
import * as assert from "assert";
import { useCrypto } from "@webda/core";
import { AuthTest } from "../test/authtest.js";
import { EMAIL_TOKEN_TTL, signEmailToken, verifyEmailToken } from "./tokens.js";

/**
 * Errors may come from lib or src class instances: compare by code
 * @param fn - code expected to throw
 * @param cls - expected error class
 * @returns assertion promise
 */
const rejectsWith = (fn: () => Promise<unknown>, cls: { name: string }) =>
  assert.rejects(fn, { code: cls.name.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase() });

const TokenInvalid = { name: "TokenInvalid" };
const TokenExpired = { name: "TokenExpired" };

@suite
class EmailTokensTest extends AuthTest {
  getTestConfiguration() {
    return { parameters: { ignoreBeans: true }, services: {} };
  }

  @test
  async roundTrip() {
    const token = await signEmailToken("recover", { email: "a@b.c", sub: "u1", pwdAt: 5 });
    const claims = await verifyEmailToken(token, "recover");
    assert.strictEqual(claims.email, "a@b.c");
    assert.strictEqual(claims.sub, "u1");
    assert.strictEqual(claims.pwdAt, 5);
    assert.strictEqual(claims.purpose, "recover");
    assert.ok(claims.jti);
    assert.deepStrictEqual(EMAIL_TOKEN_TTL, { register: 86400, verify: 86400, recover: 3600 });
  }

  @test
  async uniqueJti() {
    const a = await verifyEmailToken(await signEmailToken("verify", { email: "a@b.c" }), "verify");
    const b = await verifyEmailToken(await signEmailToken("verify", { email: "a@b.c" }), "verify");
    assert.notStrictEqual(a.jti, b.jti);
  }

  @test
  async wrongPurpose() {
    const token = await signEmailToken("verify", { email: "a@b.c" });
    await rejectsWith(() => verifyEmailToken(token, "recover"), TokenInvalid);
  }

  @test
  async missingPurposeOrEmail() {
    const crypto = useCrypto();
    const noPurpose = await crypto.jwtSign({ email: "a@b.c" }, { audience: "webda-email", expiresIn: 60 });
    await rejectsWith(() => verifyEmailToken(noPurpose, "verify"), TokenInvalid);
    const noEmail = await crypto.jwtSign({ purpose: "verify" }, { audience: "webda-email", expiresIn: 60 });
    await rejectsWith(() => verifyEmailToken(noEmail, "verify"), TokenInvalid);
    const badEmail = await crypto.jwtSign({ purpose: "verify", email: 5 }, { audience: "webda-email", expiresIn: 60 });
    await rejectsWith(() => verifyEmailToken(badEmail, "verify"), TokenInvalid);
  }

  @test
  async expired() {
    const token = await signEmailToken("verify", { email: "a@b.c" }, -10);
    await rejectsWith(() => verifyEmailToken(token, "verify"), TokenExpired);
  }

  @test
  async garbage() {
    await rejectsWith(() => verifyEmailToken("x.y.z", "verify"), TokenInvalid);
    await rejectsWith(() => verifyEmailToken(undefined as any, "verify"), TokenInvalid);
    await rejectsWith(() => verifyEmailToken(42 as any, "verify"), TokenInvalid);
  }

  @test
  async accessTokenNotAccepted() {
    const access = await useCrypto().jwtSign({ purpose: "verify", email: "a@b.c" }, { audience: "webda-access" });
    await rejectsWith(() => verifyEmailToken(access, "verify"), TokenInvalid);
  }
}
