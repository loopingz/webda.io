"use strict";
import { suite, test } from "@webda/test";
import * as assert from "assert";
import { WebdaApplicationTest } from "../test/application.js";
import { registerUserResolver, useUserResolver } from "./hooks.js";

@suite
class UserResolverTest extends WebdaApplicationTest {
  getTestConfiguration() {
    return { parameters: { ignoreBeans: true }, services: {} };
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
}
