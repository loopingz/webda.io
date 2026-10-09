import { suite, test } from "@webda/test";
import * as assert from "assert";
import {
  DomainService,
  DomainServiceParameters,
  MemoryRepository,
  registerOperation,
  registerRepository,
  Session,
  CoreModel,
  WebdaError
} from "@webda/core";
import { McpFixtureTest, registerFixture } from "../test/fixture.js";
import { errorToToolResult, runOperation } from "./invoke.js";

/**
 * Model open to everyone, queried through a real DomainService operation
 */
class McpNote extends CoreModel {
  title: string = "";
  static canAct(): boolean {
    return true;
  }
}
McpNote.registerSerializer();

@suite
class McpQueryStatementsTest extends McpFixtureTest {
  @test
  async queryToolsTakeAFilterOnly() {
    registerFixture();
    const domain = new DomainService("McpDomain", new DomainServiceParameters().load({}));
    this.registerService(domain);
    registerRepository(McpNote, new MemoryRepository(McpNote, ["uuid"]));
    await McpNote.create({ uuid: "n1", title: "keep" } as any);
    registerOperation("McpNotes.Query", {
      service: "McpDomain",
      method: "modelQuery",
      input: "searchRequest",
      output: "void",
      context: { model: McpNote }
    } as any);
    for (const query of ["DELETE", "DELETE WHERE uuid = 'n1'", "UPDATE SET title = 'pwned'", "SELECT title"]) {
      let error: unknown;
      try {
        await runOperation("McpNotes.Query", { session: new Session(), input: { query } });
      } catch (err) {
        error = err;
      }
      assert.ok(error instanceof WebdaError.BadRequest, `${query}: ${error}`);
      // What the MCP client receives: a client error, not an internal one
      const result = errorToToolResult(error);
      assert.strictEqual(result.isError, true);
      assert.match((result.content[0] as any).text, /^BAD_REQUEST: /, query);
    }
    const stored: any = await McpNote.ref("n1").get();
    assert.strictEqual(stored.title, "keep");
    const { value } = await runOperation("McpNotes.Query", {
      session: new Session(),
      input: { query: "title = 'keep'" }
    });
    assert.deepStrictEqual(
      (value as any).results.map((n: any) => n.uuid),
      ["n1"]
    );
  }
}
