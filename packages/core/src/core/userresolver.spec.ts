"use strict";
import { suite, test } from "@webda/test";
import * as assert from "assert";
import { WebdaApplicationTest } from "../test/application.js";
import { registerUserResolver, useUserResolver } from "./hooks.js";
import { User } from "../models/user.model.js";
import { MemoryRepository, registerRepository } from "@webda/models";

@suite
class UserResolverTest extends WebdaApplicationTest {
  private userRepo: MemoryRepository<typeof User> | undefined;

  getTestConfiguration() {
    return { parameters: { ignoreBeans: true }, services: {} };
  }

  async beforeEach() {
    // Register User repository for tests that need it
    this.userRepo = new MemoryRepository(User, ["uuid"]);
    registerRepository(User, this.userRepo);
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
  async resolverErrorsPropagateToGetCurrentUser() {
    const thrownError = new Error("boom");

    // Register a resolver that throws a non-not-found error
    registerUserResolver({
      resolve: async () => {
        throw thrownError;
      }
    });

    const ctx = await this.newContext();
    await ctx.init();
    ctx.getSession().login("u1", "x:email");
    // The resolver error should propagate
    await assert.rejects(() => ctx.getCurrentUser(), thrownError);
  }
}
