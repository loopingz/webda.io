import { useService } from "@webda/core";
import { HttpServer } from "@webda/core/lib/services/httpserver.service.js";
import type { TestApplication } from "@webda/core/lib/test/objects.js";
import { GrpcService } from "@webda/grpc";
import { suite, test } from "@webda/test";
import * as assert from "assert";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  GRPC_FIXTURE_SERVICES,
  GrpcFixtureService,
  fixtureState,
  registerGrpcFixture
} from "../../grpc/test/fixture.js";
import { writeSdk } from "../test/compile.js";
import { SampleAppTest } from "../test/sample-app.js";
import { SdkError } from "./client/errors.js";
import { GrpcTransport } from "./client/grpc/index.js";
import { SdkModel } from "./client/model.js";
import type { SdkGenerator } from "./sdkgenerator.service.js";

const protoDir = mkdtempSync(join(tmpdir(), "webda-sdk-grpc-"));
const protoFile = join(protoDir, "app.proto");

/**
 * Polls until a condition holds
 * @param check - the condition
 * @param ms - timeout
 */
async function until(check: () => boolean, ms = 5000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("timed out");
    await new Promise(r => setTimeout(r, 10));
  }
}

/**
 * The generated SDK, driven from Node through the h2c `GrpcService` of `sample-app`, with the streaming operations of
 * the `@webda/grpc` test fixture
 */
@suite
class SdkGrpcE2ETest extends SampleAppTest {
  static dir: string;
  static sdk: any;
  static address: string;
  static transports: GrpcTransport[] = [];
  extraServices = {
    ...GRPC_FIXTURE_SERVICES,
    HttpServer: { type: "Webda/HttpServer", port: 0, h2c: true },
    MainStore: {
      type: "Webda/MemoryStore",
      models: ["WebdaDemo/Company", "WebdaDemo/User"]
    },
    Grpc: {
      type: "Webda/GrpcService",
      protoFile,
      operations: ["Fixture.*", "Company.*", "Companies.*"]
    }
  };

  /**
   * @param app - the test application
   */
  async tweakApp(app: TestApplication): Promise<void> {
    await super.tweakApp(app);
    app.addModda("Webda/GrpcFixtureService", GrpcFixtureService);
    app.addModda("Webda/HttpServer", HttpServer);
    app.addModda("Webda/GrpcService", GrpcService);
  }

  async beforeAll(): Promise<void> {
    await super.beforeAll();
    registerGrpcFixture();
    const grpc = useService("Grpc" as any) as unknown as GrpcService;
    await grpc.build();
    grpc.loadDefinitions();
    const http: any = useService("HttpServer" as any);
    await http.start("127.0.0.1", 0);
    await until(() => http.server?.listening);
    SdkGrpcE2ETest.address = `127.0.0.1:${http.server.address().port}`;
    SdkGrpcE2ETest.dir = writeSdk(await useService<SdkGenerator>("SdkGenerator" as any).files());
    SdkGrpcE2ETest.sdk = await import(join(SdkGrpcE2ETest.dir, "index.ts"));
  }

  async afterAll(): Promise<void> {
    for (const transport of SdkGrpcE2ETest.transports) await transport.close();
    if (SdkGrpcE2ETest.dir) rmSync(SdkGrpcE2ETest.dir, { recursive: true, force: true });
    rmSync(protoDir, { recursive: true, force: true });
    await super.afterAll();
  }

  /**
   * @param headers - metadata of every call
   * @returns a client over gRPC only
   */
  client(headers?: Record<string, string>) {
    const transport = new GrpcTransport({
      address: SdkGrpcE2ETest.address,
      protoFile,
      ...(headers ? { headers: () => headers } : {})
    });
    SdkGrpcE2ETest.transports.push(transport);
    return SdkGrpcE2ETest.sdk.createClient({ cache: { ttl: 60_000 }, transports: [transport] });
  }

  @test
  async describesTheRpcsAsGenerateProtoNamesThem() {
    const api = this.client();
    assert.deepStrictEqual(api.operations["Fixture.Echo"].grpc, { service: "FixtureService", rpc: "Echo" });
    assert.deepStrictEqual(api.operations["Companies.Query"].grpc, { service: "CompaniesService", rpc: "Query" });
    // Not in the GrpcService `operations` filter
    assert.strictEqual(api.operations["User.Get"].grpc, undefined);
    const error: SdkError = await api.User.get("u1").catch((e: SdkError) => e);
    assert.match(error.message, /not exposed on the configured transports \(grpc\)/);
  }

  @test
  async unaryCallsWithMetadataAndErrors() {
    const api = this.client({ Authorization: "Bearer u1" });
    assert.deepStrictEqual(await api.call("Fixture.Echo", { text: "hi" }), { text: "hi", authorization: "Bearer u1" });
    // Per-call headers become metadata too
    assert.deepStrictEqual(
      await api.call("Fixture.Echo", { text: "hi" }, { headers: { authorization: "Bearer u2" } }),
      {
        text: "hi",
        authorization: "Bearer u2"
      }
    );
    const notFound: SdkError = await api.call("Fixture.Echo", { text: "boom" }).catch((e: SdkError) => e);
    assert.ok(notFound instanceof SdkError);
    assert.deepStrictEqual([notFound.status, notFound.code, notFound.transport], [404, "NOT_FOUND", "grpc"]);
    assert.match(notFound.message, /Nothing to echo/);
    const internal: SdkError = await api.call("Fixture.Leak", { text: "x" }).catch((e: SdkError) => e);
    assert.strictEqual(internal.status, 500);
    assert.ok(!internal.message.includes("secret"));
  }

  @test
  async crudOverGrpc() {
    const api = this.client();
    // GrpcService decodes the requests with proto defaults: an absent `uuid` would arrive as "" and fail its format
    const created = await api.Company.create({ uuid: randomUUID(), name: "Grpc Inc", permissions: ["PRODUCT_1"] });
    assert.ok(created instanceof SdkModel);
    assert.ok(created.uuid);
    assert.strictEqual(created.name, "Grpc Inc");
    const got = await api.Company.get(created.uuid, { cache: "reload" });
    assert.strictEqual(got.name, "Grpc Inc");
    assert.deepStrictEqual(got.permissions, ["PRODUCT_1"]);
    assert.strictEqual(got.hasPermission("PRODUCT_1"), true);
    const page = await api.Company.query(`name = 'Grpc Inc'`);
    assert.deepStrictEqual(
      page.results.map((c: any) => c.uuid),
      [created.uuid]
    );
    const patched = await api.Company.patch(created.uuid, { name: "Grpc Corp" });
    assert.strictEqual(patched.name, "Grpc Corp");
    assert.strictEqual((await api.Company.get(created.uuid, { cache: "reload" })).name, "Grpc Corp");
    await api.Company.delete(created.uuid);
    const error: SdkError = await api.Company.get(created.uuid, { cache: "reload" }).catch((e: SdkError) => e);
    assert.strictEqual(error.status, 404);
  }

  @test
  async everyStreamingMode() {
    const api = this.client({ authorization: "Bearer s" });
    // Server streaming, live: the fixture waits at a gate after the first tick
    fixtureState.ticksClosed = false;
    const ticks: unknown[] = [];
    for await (const tick of api.stream("Fixture.Ticks", { n: 3 })) {
      ticks.push(tick);
      if (ticks.length === 1) fixtureState.open();
    }
    assert.deepStrictEqual(ticks, [{ index: 1 }, { index: 2 }, { index: 3 }]);
    // Client streaming: the messages as an (async) iterable input
    assert.deepStrictEqual(await api.call("Fixture.Sum", [{ value: 1 }, { value: 2 }, { value: 3 }]), { total: 6 });
    async function* values() {
      yield { value: 10 };
      yield { value: 5 };
    }
    assert.deepStrictEqual(await api.call("Fixture.Sum", values()), { total: 15 });
    // Bidirectional
    fixtureState.connectClosed = false;
    const stream = api.connect("Fixture.Connect");
    stream.send({ frame: "a" });
    stream.send({ frame: "b" });
    stream.send({ frame: "bye" });
    const frames: unknown[] = [];
    for await (const frame of stream) frames.push(frame);
    await stream.closed;
    assert.deepStrictEqual(frames, [
      { frame: "hello Bearer s" },
      { frame: "echo a Bearer s" },
      { frame: "echo b Bearer s" }
    ]);
    await until(() => fixtureState.connectClosed);
    // A failing bidirectional call rejects its iteration and `closed`
    const failing = api.connect("Fixture.Connect");
    failing.send({ frame: "fail" });
    const seen: unknown[] = [];
    const error: SdkError = await (async () => {
      for await (const frame of failing) seen.push(frame);
    })().catch((e: SdkError) => e);
    assert.ok(error instanceof SdkError, `${error}`);
    assert.strictEqual(error.status, 404);
    await assert.rejects(failing.closed);
    // Leaving a server stream early cancels it
    fixtureState.ticksClosed = false;
    for await (const tick of api.stream("Fixture.Ticks", { n: 5 })) {
      assert.deepStrictEqual(tick, { index: 1 });
      break;
    }
    // The generator waits at its gate: released, its next write sees the cancellation and it closes
    await new Promise(r => setTimeout(r, 50));
    fixtureState.open();
    await until(() => fixtureState.ticksClosed);
  }

  @test
  async unreachableServerIsOffline() {
    const transport = new GrpcTransport({ address: "127.0.0.1:1", protoFile });
    SdkGrpcE2ETest.transports.push(transport);
    const api = SdkGrpcE2ETest.sdk.createClient({ transports: [transport] });
    const error: SdkError = await api
      .call("Fixture.Echo", { text: "x" }, { signal: AbortSignal.timeout(5000) })
      .catch((e: SdkError) => e);
    assert.ok(error instanceof SdkError);
    assert.strictEqual(error.isOffline(), true);
    assert.strictEqual(error.code, "UNAVAILABLE");
  }
}
