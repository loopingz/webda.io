import { suite, test } from "@webda/test";
import * as assert from "assert";
import { Password, PasswordPolicyError, registerPasswordPolicy } from "./password.model.js";
import { User } from "./user.model.js";
import { WebdaApplicationTest } from "../test/application";
import { MemoryRepository, registerRepository } from "@webda/models";
import * as WebdaError from "../errors/errors.js";

@suite
class PasswordTest extends WebdaApplicationTest {
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

  @test
  async verifyMalformedHash() {
    const pwd = new Password();
    pwd.setHash(undefined as any);
    assert.ok(!(await pwd.verify("x")));
    // bcrypt.compare rejects on a non-string hash
    pwd.__hash = 12 as any;
    assert.ok(!(await pwd.verify("x")));
  }

  @test
  async userAlwaysHasPassword() {
    assert.ok(new User().password instanceof Password);
    assert.ok(!new User().password.hasPassword());
  }

  /**
   * Create a persisted user with a known password
   * @returns the persisted user
   */
  private async createUser(): Promise<User> {
    registerRepository(User, new MemoryRepository(User, ["uuid"]));
    const user = new User({ uuid: "pwd-user" } as any);
    await user.password.set("current-pass");
    user.password.changedAt = 1;
    await user.save();
    return user;
  }

  @test
  async changeWrongCurrent() {
    const user = await this.createUser();
    const hash = user.password.__hash;
    await assert.rejects(() => user.password.change("nope", "another-pass"), WebdaError.Forbidden);
    const reloaded = await User.ref("pwd-user").get();
    assert.strictEqual(reloaded.password.__hash, hash);
  }

  @test
  async changeSuccess() {
    const user = await this.createUser();
    await user.password.change("current-pass", "another-pass");
    const reloaded = await User.ref("pwd-user").get();
    assert.ok(reloaded.password instanceof Password);
    assert.ok(await reloaded.password.verify("another-pass"));
    assert.ok(!(await reloaded.password.verify("current-pass")));
    assert.ok(reloaded.password.changedAt > 1);
  }

  @test
  async changeWeakNext() {
    const user = await this.createUser();
    const hash = user.password.__hash;
    await assert.rejects(() => user.password.change("current-pass", "short"), PasswordPolicyError);
    const reloaded = await User.ref("pwd-user").get();
    assert.strictEqual(reloaded.password.__hash, hash);
    assert.strictEqual(reloaded.password.changedAt, 1);
  }

  @test
  async changeWithoutTokenService() {
    const user = await this.createUser();
    await user.password.change("current-pass", "another-pass");
  }
}
