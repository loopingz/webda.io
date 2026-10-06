import { suite, test } from "@webda/test";
import * as assert from "assert";
import { Password, PasswordPolicyError, registerPasswordPolicy } from "./password.model.js";
import { User } from "./user.model.js";

@suite
class PasswordTest {
  afterEach() {
    registerPasswordPolicy(undefined);
  }

  @test
  async setAndVerify() {
    const pwd = new Password();
    assert.ok(!pwd.hasPassword());
    await pwd.set("longenough");
    assert.ok(pwd.hasPassword());
    assert.ok(pwd.__hash.startsWith("$2"));
    assert.ok(pwd.changedAt <= Date.now());
    assert.ok(await pwd.verify("longenough"));
    assert.ok(!(await pwd.verify("wrong")));
    assert.ok(!(await new Password().verify("anything")));
  }

  @test
  async defaultPolicy() {
    await assert.rejects(
      () => new Password().set("short"),
      (e: any) => e instanceof PasswordPolicyError && e.getResponseCode() === 400 && e.code === "PASSWORD_POLICY"
    );
  }

  @test
  async customPolicy() {
    registerPasswordPolicy({ validate: async p => p === "magic" });
    await new Password().set("magic");
    await assert.rejects(() => new Password().set("longenough"), PasswordPolicyError);
  }

  @test
  async setHash() {
    const pwd = new Password();
    pwd.setHash("h", 5);
    assert.ok(pwd.hasPassword());
    assert.strictEqual(pwd.changedAt, 5);
  }

  @test
  async userHydratesV3Password() {
    const user = new User().load({ uuid: "u1", __password: "$2a$10$abcdefghijklmnopqrstuv" } as any);
    assert.ok(user.password instanceof Password);
    assert.strictEqual(user.password.__hash, "$2a$10$abcdefghijklmnopqrstuv");
    assert.strictEqual((user as any).__password, undefined);
  }

  @test
  async userConstructorV3Password() {
    const user = new User({ uuid: "u1", __password: "$2a$10$abcdefghijklmnopqrstuv" } as any);
    assert.ok(user.password instanceof Password);
    assert.strictEqual(user.password.__hash, "$2a$10$abcdefghijklmnopqrstuv");
    assert.strictEqual((user as any).__password, undefined);
  }

  @test
  async jsonKeepsHashButDtoDoesNot() {
    const user = new User().load({ uuid: "u1", password: { __hash: "h", changedAt: 1 } } as any);
    assert.strictEqual(JSON.parse(JSON.stringify(user)).password.__hash, "h");
    assert.strictEqual(user.toDTO().password.__hash, undefined);
  }
}
