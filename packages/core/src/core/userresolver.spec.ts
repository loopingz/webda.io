import { suite, test } from "@webda/test";
import * as assert from "assert";
import { WebdaApplicationTest } from "../test/application.js";
import { registerUserResolver, useUserResolver } from "./hooks.js";
import { useModelStore } from "./hooks.js";
import { useModel } from "../application/hooks.js";

@suite
class UserResolverTest extends WebdaApplicationTest {
  getTestConfiguration() {
    return {
      parameters: { ignoreBeans: true },
      services: {
        AuthStore: {
          type: "Webda/MemoryStore",
          models: ["Webda/User"]
        }
      }
    };
  }

  afterEach() {
    registerUserResolver(undefined);
  }

  @test
  async customResolver() {
    const fake: any = { getUUID: () => "u1", marker: true };
    registerUserResolver({ resolve: async id => (id === "u1" ? fake : undefined) });
    const ctx = await this.newContext();
    await ctx.init();
    ctx.getSession().login("u1", "x:email");
    assert.strictEqual(await ctx.getCurrentUser(), fake);
    assert.strictEqual(await useUserResolver().resolve("nope"), undefined);
  }

  @test
  async defaultResolverReturnsUndefinedWhenAnonymous() {
    const ctx = await this.newContext();
    await ctx.init();
    assert.strictEqual(await ctx.getCurrentUser(), undefined);
  }

  @test
  async defaultResolverReturnsUndefinedForNonExistentUser() {
    // Test 1: Non-existent user returns undefined
    const ctx = await this.newContext();
    await ctx.init();
    ctx.getSession().login("ghost", "x:email");
    assert.strictEqual(await ctx.getCurrentUser(), undefined);

    // Test 2: Real user is properly fetched
    const store: any = useModelStore("User");
    const repo = store.getRepository(useModel("User"));
    const realUser = await repo.create({ uuid: "u-real", displayName: "Real" });
    const ctx2 = await this.newContext();
    await ctx2.init();
    ctx2.getSession().login("u-real", "x:email");
    const user = await ctx2.getCurrentUser();
    assert.strictEqual(user?.displayName, "Real");
  }

  @test
  async defaultResolverPropagatesRepositoryErrors() {
    const store: any = useModelStore("User");
    const repo = store.getRepository(useModel("User"));
    const original = repo.exists;
    repo.exists = async () => {
      throw new Error("boom");
    };

    try {
      const ctx = await this.newContext();
      await ctx.init();
      ctx.getSession().login("u1", "x:email");
      await assert.rejects(() => ctx.getCurrentUser(), /boom/);
    } finally {
      repo.exists = original;
    }
  }
}
