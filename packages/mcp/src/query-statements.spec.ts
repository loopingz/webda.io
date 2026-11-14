import { suite, test } from "@webda/test";
import * as assert from "assert";
import {
  DomainService,
  DomainServiceParameters,
  isReadOnlyOperation,
  MemoryRepository,
  registerOperation,
  registerRepository,
  Session,
  CoreModel,
  useApplication,
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

/**
 * An author: hidden ones are read by nobody
 */
class McpAuthor extends CoreModel {
  name: string = "";
  hidden?: boolean;
  static canAct(_context: any, _action: string, object?: McpAuthor): boolean {
    return !object?.hidden;
  }
}
McpAuthor.registerSerializer();
(McpAuthor as any).Metadata = { Identifier: "Test/McpAuthor", PrimaryKey: ["uuid"], Subclasses: [], Relations: {} };

/**
 * An article linking to its author
 */
class McpArticle extends CoreModel {
  title: string = "";
  author: string = "";
  static canAct(): boolean {
    return true;
  }
}
McpArticle.registerSerializer();
(McpArticle as any).Metadata = {
  Identifier: "Test/McpArticle",
  PrimaryKey: ["uuid"],
  Subclasses: [],
  Relations: { links: [{ attribute: "author", model: "Test/McpAuthor", type: "LINK" }] }
};

@suite
class McpQueryStatementsTest extends McpFixtureTest {
  @test
  async queryToolsTakeAFilterOrAFieldList() {
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
    for (const query of [
      "DELETE",
      "DELETE WHERE uuid = 'n1'",
      "UPDATE SET title = 'pwned'",
      "SELECT COUNT(*) AS n",
      "SELECT __secret",
      "SELECT title.constructor"
    ]) {
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
    // A field list is accepted: a smaller tool result, the selected fields plus the primary key
    const partial = await runOperation("McpNotes.Query", {
      session: new Session(),
      input: { query: "SELECT title WHERE title = 'keep'" }
    });
    assert.deepStrictEqual(JSON.parse(JSON.stringify((partial.value as any).results)), [{ uuid: "n1", title: "keep" }]);
  }

  @test
  async queryToolsNeverRunStatements() {
    registerFixture();
    // Statements are enabled for every model of the service, in both modes
    for (const mode of ["bulk", "events"]) {
      const name = `McpStatementDomain${mode}`;
      this.registerService(
        new DomainService(name, new DomainServiceParameters().load({ queryStatements: { "*": mode } }))
      );
      registerRepository(McpAuthor, new MemoryRepository(McpAuthor, ["uuid"]));
      await McpAuthor.create({ uuid: "a1", name: "Ada" } as any);
      registerOperation("McpAuthors.Query", {
        service: name,
        method: "modelQuery",
        input: "searchRequest",
        output: "void",
        context: { model: McpAuthor }
      } as any);
      for (const [id, method] of [
        ["McpAuthor.Patch", "modelPatch"],
        ["McpAuthor.Delete", "modelDelete"]
      ]) {
        registerOperation(id, {
          service: name,
          method,
          input: "void",
          output: "void",
          context: { model: McpAuthor, pkFields: ["uuid"] }
        } as any);
      }
      // The Query tool is announced read-only (`readOnlyHint`): a client may call it without asking the user, so
      // it never writes. The Patch and Delete tools do
      assert.strictEqual(isReadOnlyOperation("McpAuthors.Query", {}), true);
      for (const query of ["DELETE", "DELETE WHERE uuid = 'a1'", "UPDATE SET name = 'pwned'"]) {
        let error: unknown;
        try {
          await runOperation("McpAuthors.Query", { session: new Session(), input: { query } });
        } catch (err) {
          error = err;
        }
        assert.ok(error instanceof WebdaError.BadRequest, `${query}: ${error}`);
        assert.strictEqual(
          (errorToToolResult(error).content[0] as any).text,
          `BAD_REQUEST: ${query.split(" ")[0]} statements are not accepted by queries`
        );
      }
      assert.strictEqual(((await McpAuthor.ref("a1").get()) as any).name, "Ada");
    }
  }

  @test
  async queryToolsHydrateRelations() {
    registerFixture();
    this.registerService(new DomainService("McpHydrateDomain", new DomainServiceParameters().load({})));
    useApplication<any>().addModel("Test/McpAuthor", McpAuthor, (McpAuthor as any).Metadata);
    registerRepository(McpAuthor, new MemoryRepository(McpAuthor, ["uuid"]));
    registerRepository(McpArticle, new MemoryRepository(McpArticle, ["uuid"]));
    await McpAuthor.create({ uuid: "a1", name: "Ada" } as any);
    await McpAuthor.create({ uuid: "a2", name: "Bob", hidden: true } as any);
    await McpArticle.create({ uuid: "n1", title: "one", author: "a1" } as any);
    await McpArticle.create({ uuid: "n2", title: "two", author: "a2" } as any);
    await McpArticle.create({ uuid: "n3", title: "three", author: "gone" } as any);
    registerOperation("McpArticles.Query", {
      service: "McpHydrateDomain",
      method: "modelQuery",
      input: "searchRequest",
      output: "void",
      context: { model: McpArticle }
    } as any);
    // A related object is read like a call of its Get tool
    registerOperation("McpAuthor.Get", {
      service: "McpHydrateDomain",
      method: "modelGet",
      input: "void",
      output: "void",
      context: { model: McpAuthor, pkFields: ["uuid"] }
    } as any);
    const query = async (q: string) => {
      const { value } = await runOperation("McpArticles.Query", { session: new Session(), input: { query: q } });
      return JSON.parse(JSON.stringify((value as any).results));
    };
    // One call instead of one per article: the author replaces its key, null when missing or unreadable
    assert.deepStrictEqual(await query("HYDRATE author ORDER BY uuid ASC"), [
      { uuid: "n1", title: "one", author: { uuid: "a1", name: "Ada" } },
      { uuid: "n2", title: "two", author: null },
      { uuid: "n3", title: "three", author: null }
    ]);
    // INNER drops the articles without a readable author, and a field list keeps the tool result small
    assert.deepStrictEqual(await query("SELECT author.name HYDRATE author INNER"), [
      { uuid: "n1", author: { uuid: "a1", name: "Ada" } }
    ]);
    for (const q of ["HYDRATE title", "HYDRATE author.a.b", "HYDRATE author, author", "HYDRATE __secret"]) {
      let error: unknown;
      try {
        await query(q);
      } catch (err) {
        error = err;
      }
      assert.ok(error instanceof WebdaError.BadRequest, `${q}: ${error}`);
      assert.match((errorToToolResult(error).content[0] as any).text, /^BAD_REQUEST: /, q);
    }
  }
}
