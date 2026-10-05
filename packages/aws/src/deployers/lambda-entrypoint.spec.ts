import { suite, test } from "@webda/test";
import * as assert from "assert";
import { vi } from "vitest";

const boot = vi.hoisted(() => ({
  services: {} as Record<string, any>,
  appPaths: [] as string[],
  inits: 0,
  fail: false
}));

vi.mock("@webda/core", async importOriginal => {
  const original: any = await importOriginal();
  return {
    ...original,
    Application: class {
      constructor(path: string) {
        boot.appPaths.push(path);
      }
      async load() {
        if (boot.fail) {
          boot.fail = false;
          throw new Error("Boot failed");
        }
        return this;
      }
    },
    Core: class {
      async init() {
        boot.inits++;
        return this;
      }
      getServices() {
        return boot.services;
      }
    }
  };
});

const { bootLambdaServer, handler } = await import("./lambda-entrypoint.js");
const { LambdaServer, LambdaServerParameters } = await import("../services/lambdaserver.service.js");

@suite
class LambdaEntrypointTest {
  beforeEach() {
    boot.services = {};
    boot.appPaths = [];
    boot.inits = 0;
  }

  @test
  async bootServer() {
    const server = new LambdaServer("api", new LambdaServerParameters().load({}));
    boot.services = { other: {}, api: server };
    const booted = await bootLambdaServer("/var/task");
    assert.strictEqual(booted.lambda, server);
    assert.ok(booted.instance.application);
    assert.deepStrictEqual(boot.appPaths, ["/var/task"]);
    // Found by its class name when it comes from another copy of the package
    class LambdaServerCopy {}
    Object.defineProperty(LambdaServerCopy, "name", { value: "LambdaServer" });
    const copy = new LambdaServerCopy();
    boot.services = { api: copy };
    assert.strictEqual((await bootLambdaServer("/var/task")).lambda, copy);
    boot.services = {};
    await assert.rejects(() => bootLambdaServer("/var/task"), /No LambdaServer service found/);
  }

  @test
  async handlerBootsOnce() {
    const handleRequest = vi.fn().mockResolvedValue({ statusCode: 200 });
    boot.services = { api: { constructor: { name: "LambdaServer" }, handleRequest } };
    // A failed boot is retried on the next invocation
    boot.fail = true;
    await assert.rejects(() => handler({}, <any>{}), /Boot failed/);
    assert.deepStrictEqual(await handler({ path: "/" }, <any>{}), { statusCode: 200 });
    assert.deepStrictEqual(await handler({ path: "/2" }, <any>{}), { statusCode: 200 });
    assert.strictEqual(boot.inits, 1);
    assert.deepStrictEqual(handleRequest.mock.calls[1][0], { path: "/2" });
  }
}
