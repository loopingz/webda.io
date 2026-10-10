import { suite, test } from "@webda/test";
import * as assert from "assert";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import WebSocket from "ws";
import { useInstanceStorage, useService } from "@webda/core";
import { HttpServer } from "@webda/core/lib/services/httpserver.service.js";
import { WebdaApplicationTest } from "@webda/core/lib/test/application.js";
import { TestApplication } from "@webda/core/lib/test/objects.js";
import { GRPC_FIXTURE_SERVICES, GrpcFixtureService, fixtureState, registerGrpcFixture } from "../test/fixture.js";
import { GrpcService } from "./grpcservice.service.js";

const protoFile = join(mkdtempSync(join(tmpdir(), "connect-e2e-")), "app.proto");

/**
 * @param check - condition
 */
async function until(check: () => boolean): Promise<void> {
  for (let i = 0; i < 500 && !check(); i++) await new Promise(r => setTimeout(r, 10));
  if (!check()) throw new Error("timed out");
}

/** The same `async *connect(frames)` served as a gRPC bidi stream (h2c) and as a WebSocket (HTTP/1.1). */
@suite
class ConnectEndToEndTest extends WebdaApplicationTest {
  getTestConfiguration(): any {
    return {
      services: {
        ...GRPC_FIXTURE_SERVICES,
        HttpServer: { type: "Webda/HttpServer", port: 0 },
        GrpcServer: { type: "Webda/HttpServer", port: 0, h2c: true },
        RESTService: { type: "Webda/RESTOperationsTransport" },
        Grpc: { type: "Webda/GrpcService", protoFile, operations: ["Fixture.*"] }
      }
    };
  }

  async tweakApp(app: TestApplication): Promise<void> {
    await super.tweakApp(app);
    app.addModda("Webda/GrpcFixtureService", GrpcFixtureService);
    app.addModda("Webda/HttpServer", HttpServer);
    app.addModda("Webda/GrpcService", GrpcService);
  }

  @test
  async sameOperationOnBothTransports() {
    registerGrpcFixture();
    const grpcService = useService("Grpc" as any) as unknown as GrpcService;
    await grpcService.build();
    grpcService.loadDefinitions();
    (useService("RESTService" as any) as any).exposeServiceOperations({
      "Fixture.Connect": useInstanceStorage().operations["Fixture.Connect"]
    });
    const http = useService("HttpServer" as any) as any;
    const h2c = useService("GrpcServer" as any) as any;
    await http.start("127.0.0.1", 0);
    await h2c.start("127.0.0.1", 0);
    let client: any;
    let ws: WebSocket | undefined;
    try {
      await until(() => http.server?.listening && h2c.server?.listening);

      // gRPC
      fixtureState.connectClosed = false;
      const definition = protoLoader.loadSync(protoFile, { keepCase: true, defaults: true, oneofs: true });
      const pkg: any = grpc.loadPackageDefinition(definition).webda;
      client = new pkg.FixtureService(`127.0.0.1:${h2c.server.address().port}`, grpc.credentials.createInsecure());
      const metadata = new grpc.Metadata();
      metadata.set("authorization", "Bearer e2e");
      const call = client.Connect(metadata);
      const overGrpc: string[] = [];
      let grpcStatus: any;
      call.on("data", (m: any) => overGrpc.push(m.frame));
      call.on("status", (s: any) => (grpcStatus = s));
      call.on("error", () => {});
      await until(() => overGrpc.length === 1);
      call.write({ frame: "x" });
      await until(() => overGrpc.length === 2);
      call.end();
      await until(() => grpcStatus !== undefined);
      assert.strictEqual(grpcStatus.code, grpc.status.OK);
      await until(() => fixtureState.connectClosed);

      // WebSocket
      fixtureState.connectClosed = false;
      ws = new WebSocket(`ws://127.0.0.1:${http.server.address().port}/fixture/connect`, {
        headers: { authorization: "Bearer e2e" }
      });
      const overWs: string[] = [];
      ws.on("message", data => overWs.push(JSON.parse(String(data)).frame));
      let wsClose: number | undefined;
      ws.on("close", code => (wsClose = code));
      await new Promise(r => ws!.on("open", r));
      await until(() => overWs.length === 1);
      ws.send(JSON.stringify({ frame: "x" }));
      await until(() => overWs.length === 2);
      ws.close(1000);
      await until(() => wsClose !== undefined);
      assert.strictEqual(wsClose, 1000);
      await until(() => fixtureState.connectClosed);

      assert.deepStrictEqual(overGrpc, ["hello Bearer e2e", "echo x Bearer e2e"]);
      assert.deepStrictEqual(overWs, overGrpc);
    } finally {
      client?.close();
      ws?.terminate();
      await http.stop();
      await h2c.stop();
    }
  }
}
