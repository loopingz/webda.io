import { suite, test } from "@webda/test";
import * as assert from "assert";
import {
  CoreModel,
  DomainService,
  DomainServiceParameters,
  MemoryRepository,
  registerOperation,
  registerRepository,
  registerSchema,
  useApplication
} from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test/application.js";
import { GrpcService } from "./grpcservice.service.js";
import { GrpcStatus } from "./grpc-stream.js";

/**
 * Model open to everyone, queried through a real DomainService operation
 */
class GrpcNote extends CoreModel {
  title: string = "";
  static canAct(): boolean {
    return true;
  }
}
GrpcNote.registerSerializer();

/**
 * The gRPC unary dispatch with the real core: a Query operation takes a filter only
 */
@suite
class GrpcQueryStatementsTest extends WebdaApplicationTest {
  /**
   * @returns an application without any configured service
   */
  getTestConfiguration(): any {
    return { services: {} };
  }

  /**
   * Send one message through the gRPC unary handler
   * @param query - the query field of the request
   * @returns the response or the gRPC error status
   */
  async unary(query: string): Promise<{ response?: any; status?: number; message?: string }> {
    const service: any = Object.create(GrpcService.prototype);
    const result: { response?: any; status?: number; message?: string } = {};
    const stream = {
      onMessage: (callback: (message: any) => void) => callback({ query }),
      sendUnary: (response: any) => (result.response = response),
      sendError: (status: number, message: string) => {
        result.status = status;
        result.message = message;
      }
    };
    await service.handleUnary(stream, "GrpcNotes.Query", {});
    return result;
  }

  @test
  async queryRpcTakesAFilterOnly() {
    const schema = { type: "object", properties: { query: { type: "string" } } };
    useApplication().getSchemas()["grpcSearchRequest"] = schema;
    try {
      registerSchema("grpcSearchRequest", schema);
    } catch {
      // already registered
    }
    this.registerService(new DomainService("GrpcDomain", new DomainServiceParameters().load({})));
    registerRepository(GrpcNote, new MemoryRepository(GrpcNote, ["uuid"]));
    await GrpcNote.create({ uuid: "n1", title: "keep" } as any);
    registerOperation("GrpcNotes.Query", {
      service: "GrpcDomain",
      method: "modelQuery",
      input: "grpcSearchRequest",
      output: "void",
      context: { model: GrpcNote }
    } as any);
    for (const query of ["DELETE", "DELETE WHERE uuid = 'n1'", "UPDATE SET title = 'pwned'", "SELECT title"]) {
      const res = await this.unary(query);
      assert.strictEqual(res.status, GrpcStatus.INVALID_ARGUMENT, `${query}: ${res.message}`);
    }
    assert.strictEqual(((await GrpcNote.ref("n1").get()) as any).title, "keep");
    const ok = await this.unary("title = 'keep'");
    assert.strictEqual(ok.status, undefined, ok.message);
    assert.deepStrictEqual(
      ok.response.results.map((n: any) => n.uuid),
      ["n1"]
    );
  }
}
