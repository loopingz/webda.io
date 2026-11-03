import { suite, test } from "@webda/test";
import * as assert from "assert";
import { runAsSystem, SealedFormatError, WebdaError, type EscrowBlob } from "@webda/core";
import type { WebContext } from "@webda/core";
import { EmailTest } from "../test/emailtest.js";

const rnd = (n: number) => Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(n))).toString("base64url");

/**
 * Shape-valid escrow blob: the server validates the shape only, the key material is opened on the client
 * @param kind - escrow kind
 * @returns the blob
 */
function escrow(kind: EscrowBlob["kind"] = "password", kid: string = "k1"): EscrowBlob {
  return {
    v: 1,
    kind,
    kid,
    kdf: "argon2id",
    kdfParams: { m: 65536, t: 3, p: 1 },
    salt: rnd(16),
    iv: rnd(12),
    ct: rnd(48)
  };
}

/**
 * `Auth.Password.Change` with end-to-end encryption keys: the password escrow follows the login password
 */
@suite
class PasswordEscrowTest extends EmailTest {
  /**
   * Register a user and store enrolled keys on it (stored directly: the enrollment itself is tested in core)
   * @param email - user email
   * @param escrows - escrows to store
   * @returns a context logged as the user
   */
  async enrolled(email: string, escrows: Partial<Record<EscrowBlob["kind"], EscrowBlob>>): Promise<WebContext> {
    const ctx = await this.ctx();
    await this.op("Auth.Email.Register", { email, password: "longenough" }, ctx);
    const jwk = { kty: "EC", crv: "P-256", x: rnd(32), y: rnd(32) };
    await runAsSystem(() =>
      this.auth
        .getUserModel()
        .ref(ctx.getCurrentUserId())
        .patch({
          keys: {
            publicKeys: [{ kid: "k1", alg: "ECDH-ES+A256GCM", jwk, createdAt: Date.now() }],
            __keyring: { v: 1, kid: "k1", iv: rnd(12), ct: rnd(64) },
            __escrows: escrows,
            devices: []
          }
        } as any)
    );
    return ctx;
  }

  /**
   * @param ctx - context of the user
   * @returns the stored escrows of the user
   */
  async escrowsOf(ctx: WebContext): Promise<any> {
    const user: any = await runAsSystem(() => this.auth.getUserModel().ref(ctx.getCurrentUserId()).get());
    return user.keys.__escrows;
  }

  /**
   * @param email - user email
   * @param password - password to try
   * @returns true when the password logs in
   */
  async logsIn(email: string, password: string): Promise<boolean> {
    try {
      await this.op("Auth.Email.Login", { email, password });
      return true;
    } catch {
      return false;
    }
  }

  @test
  async requiresTheNewEscrow() {
    const ctx = await this.enrolled("escrow@x.com", { password: escrow() });
    const before = await this.escrowsOf(ctx);
    await assert.rejects(
      () => this.op("Auth.Password.Change", { current: "longenough", next: "brandnewpass" }, ctx),
      (err: any) => err instanceof WebdaError.PreconditionFailed && /escrow/.test(err.message)
    );
    // Nothing changed
    assert.ok(await this.logsIn("escrow@x.com", "longenough"));
    assert.deepStrictEqual(await this.escrowsOf(ctx), before);
  }

  @test
  async changesBothTogether() {
    const ctx = await this.enrolled("both@x.com", { password: escrow(), recovery: escrow("recovery") });
    const before = await this.escrowsOf(ctx);
    const next = escrow();
    // A wrong current password changes nothing, the escrow included
    await assert.rejects(
      () => this.op("Auth.Password.Change", { current: "wrongwrong", next: "brandnewpass", escrow: next }, ctx),
      WebdaError.Forbidden
    );
    assert.deepStrictEqual(await this.escrowsOf(ctx), before);
    // An invalid escrow is refused before the password changes
    await assert.rejects(
      () =>
        this.op(
          "Auth.Password.Change",
          { current: "longenough", next: "brandnewpass", escrow: { ...next, kind: "recovery" } },
          ctx
        ),
      SealedFormatError
    );
    assert.ok(await this.logsIn("both@x.com", "longenough"));
    assert.deepStrictEqual(await this.escrowsOf(ctx), before);
    // An escrow made for another key than the active one (a device that missed a rotation) is refused too
    await assert.rejects(
      () =>
        this.op(
          "Auth.Password.Change",
          { current: "longenough", next: "brandnewpass", escrow: escrow("password", "stale") },
          ctx
        ),
      (err: any) => err instanceof WebdaError.PreconditionFailed && /another key than the active one/.test(err.message)
    );
    assert.ok(await this.logsIn("both@x.com", "longenough"));

    await this.op("Auth.Password.Change", { current: "longenough", next: "brandnewpass", escrow: next }, ctx);
    assert.ok(await this.logsIn("both@x.com", "brandnewpass"));
    assert.ok(!(await this.logsIn("both@x.com", "longenough")));
    // The password escrow is replaced, the recovery one is kept
    assert.deepStrictEqual(await this.escrowsOf(ctx), { password: next, recovery: before.recovery });
  }

  @test
  async recoveryOnlyKeys() {
    // Without a password escrow the password changes alone, and an escrow given creates one
    const ctx = await this.enrolled("recovery@x.com", { recovery: escrow("recovery") });
    await this.op("Auth.Password.Change", { current: "longenough", next: "brandnewpass" }, ctx);
    assert.strictEqual((await this.escrowsOf(ctx)).password, undefined);
    const created = escrow();
    await this.op("Auth.Password.Change", { current: "brandnewpass", next: "yetanotherpass", escrow: created }, ctx);
    assert.deepStrictEqual((await this.escrowsOf(ctx)).password, created);
    assert.ok(await this.logsIn("recovery@x.com", "yetanotherpass"));
  }

  @test
  async escrowWithoutKeys() {
    const ctx = await this.ctx();
    await this.op("Auth.Email.Register", { email: "nokeys@x.com", password: "longenough" }, ctx);
    await assert.rejects(
      () => this.op("Auth.Password.Change", { current: "longenough", next: "brandnewpass", escrow: escrow() }, ctx),
      (err: any) => err instanceof WebdaError.BadRequest && /keys/.test(err.message)
    );
    assert.ok(await this.logsIn("nokeys@x.com", "longenough"));
    // Without keys the change needs no escrow
    await this.op("Auth.Password.Change", { current: "longenough", next: "brandnewpass" }, ctx);
    assert.ok(await this.logsIn("nokeys@x.com", "brandnewpass"));
  }
}
