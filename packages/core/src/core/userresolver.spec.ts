"use strict";
import { suite, test } from "@webda/test";
import * as assert from "assert";
import { WebdaApplicationTest } from "../test/application.js";
import { registerUserResolver, useUserResolver } from "./hooks.js";
import { User } from "../models/user.model.js";
import { MemoryRepository, registerRepository } from "@webda/models";

@suite
class UserResolverTest extends WebdaApplicationTest {
  getTestConfiguration() {
    return {
      services: {
        AuthStore: {
          type: "Webda/MemoryStore",
          models: ["Webda/User"]
        }
      }
    };
  }

  async beforeAll(init?: boolean): Promise<void> {
    await super.beforeAll(init);
    // Register User repository for default resolver tests
    const userRepo = new MemoryRepository(User, ["uuid"]);
    registerRepository(User, userRepo);
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
    const ctx = await this.newContext();
    await ctx.init();
    ctx.getSession().login("nonexistent-user-id", "x:email");
    assert.strictEqual(await ctx.getCurrentUser(), undefined);
  }

  @test
  async defaultResolverThrowsOnRepositoryError() {
    const thrownError = new Error("Repository connection failed");
    registerUserResolver({
      resolve: async () => {
        throw thrownError;
      }
    });
    const ctx = await this.newContext();
    await ctx.init();
    ctx.getSession().login("u1", "x:email");
    await assert.rejects(() => ctx.getCurrentUser(), thrownError);
  }
}
