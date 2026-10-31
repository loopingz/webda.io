import { suite, test } from "@webda/test";
import * as assert from "assert";
import { afterEach } from "vitest";
import {
  registerRequestTracer,
  RequestTracer,
  traceRequest,
  TracedRequest,
  useRequestTracer
} from "./requesttracer.js";
import { createSubnetChecker } from "./subnetchecker.js";

const request: TracedRequest = { protocol: "http", method: "GET", path: "/test", headers: {} };

afterEach(() => registerRequestTracer(undefined));

@suite
class RequestTracerTest {
  @test
  async withoutTracer() {
    let calls = 0;
    const result = await traceRequest(request, async handle => {
      calls++;
      handle.setStatus(200);
      return "ok";
    });
    assert.strictEqual(result, "ok");
    assert.strictEqual(calls, 1);
  }

  @test
  async usesRegisteredTracer() {
    const seen: TracedRequest[] = [];
    const tracer: RequestTracer = {
      trace: (req, fn) => {
        seen.push(req);
        return fn({ setStatus: () => {} });
      }
    };
    registerRequestTracer(tracer);
    assert.strictEqual(useRequestTracer(), tracer);
    assert.strictEqual(await traceRequest(request, async () => 1), 1);
    assert.deepStrictEqual(seen, [request]);
    registerRequestTracer(undefined);
    assert.strictEqual(useRequestTracer(), undefined);
    assert.strictEqual(await traceRequest(request, async () => 2), 2);
    assert.strictEqual(seen.length, 1);
  }

  @test
  async fallsBackWhenTracerFailsBeforeFn() {
    for (const tracer of [
      {
        trace: () => {
          throw new Error("sync");
        }
      },
      { trace: async () => Promise.reject(new Error("async")) }
    ] as RequestTracer[]) {
      registerRequestTracer(tracer);
      let calls = 0;
      const result = await traceRequest(request, async () => {
        calls++;
        return "ok";
      });
      assert.strictEqual(result, "ok");
      assert.strictEqual(calls, 1);
    }
  }

  @test
  async fnErrorPropagatesWithoutRerun() {
    registerRequestTracer({ trace: (_req, fn) => fn({ setStatus: () => {} }) });
    let calls = 0;
    await assert.rejects(
      traceRequest(request, async () => {
        calls++;
        throw new Error("boom");
      }),
      /boom/
    );
    assert.strictEqual(calls, 1);
    // A tracer failing after fn ran does not re-run it either
    registerRequestTracer({
      trace: async (_req, fn) => {
        await fn({ setStatus: () => {} });
        throw new Error("tracer");
      }
    });
    calls = 0;
    assert.strictEqual(
      await traceRequest(request, async () => {
        calls++;
        return "done";
      }),
      "done"
    );
    assert.strictEqual(calls, 1);
  }

  @test
  subnetChecker() {
    const check = createSubnetChecker(["10.0.0.0/8", "192.168.1.1"]);
    assert.ok(check("10.2.3.4"));
    assert.ok(check("192.168.1.1"));
    assert.ok(!check("192.168.1.2"));
  }
}
