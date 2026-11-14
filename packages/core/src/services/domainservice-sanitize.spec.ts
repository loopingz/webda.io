import { suite, test } from "@webda/test";
import * as assert from "assert";
import { MemoryRepository, registerRepository, UuidModel } from "@webda/models";
import { WebdaApplicationTest } from "../test/index.js";
import { RESTOperationsTransport, RESTOperationsTransportParameters } from "../rest/restoperationstransport.service.js";
import { Router, RouterParameters } from "../rest/router.service.js";
import { useRouter } from "../rest/hooks.js";
import { WebContext } from "../contexts/webcontext.js";
import { HttpContext, HttpMethodType } from "../contexts/httpcontext.js";
import { runWithContext } from "../contexts/execution.js";
import { SimpleOperationContext } from "../contexts/simplecontext.js";
import { getRawTextPaths, sanitizeInput, SANITIZE_KEYWORD } from "../contexts/sanitize.js";
import { callOperation, readOperationBody, registerOperation } from "../core/operations.js";
import { useApplication } from "../application/hooks.js";
import { useDynamicService } from "../core/hooks.js";
import type { Application } from "../application/application.js";
import type { IOperationContext } from "../contexts/icontext.js";
import * as WebdaError from "../errors/errors.js";
import { DomainService, getModelRawTextPaths, sanitizeModelInput, sanitizeModelText } from "./domainservice.service.js";

/**
 * The texts of the table of #1068: plain user text that the HTML sanitization corrupts
 */
const PLAIN_TEXTS = ["R&D", "a && b", "Tom <3 Jerry", "A-->B"];

/**
 * A display name refuses control and format characters, and surrounding spaces
 */
const DISPLAY_NAME_PATTERN = "^(?!\\s)[^\\p{Cc}\\p{Cf}]*(?<!\\s)$";

/**
 * Model whose `displayName` (and other texts) opt out of the HTML sanitization
 */
class Team extends UuidModel {
  displayName?: string;
  description?: string;
  labels?: string[];
  aliases?: Record<string, string>;
  profile?: { bio?: string; motto?: string };
  members?: { name: string; role?: string }[];
  meta?: any;
  owner?: string;
  /**
   * Record every input the DomainService handed to the model
   */
  static canAct(): boolean {
    return true;
  }

  static getProtectedAttributes(): string[] {
    return ["owner"];
  }
}

/**
 * Child of Team, created through the nested route: the transport injects the parent in the body
 */
class TeamNote extends UuidModel {
  team: string;
  title?: string;
  body?: string;

  static canAct(_context: IOperationContext): boolean {
    return true;
  }
}

Team.registerSerializer();
TeamNote.registerSerializer();

const NONE = { [SANITIZE_KEYWORD]: "none" };

const TEAM_SCHEMA: any = {
  type: "object",
  properties: {
    uuid: { type: "string" },
    displayName: { type: "string", pattern: DISPLAY_NAME_PATTERN, ...NONE },
    description: { type: "string" },
    // `text` names the default, an unknown profile is sanitized like it
    summary: { type: "string", [SANITIZE_KEYWORD]: "text" },
    notes: { type: "string", [SANITIZE_KEYWORD]: "markdown" },
    labels: { type: "array", items: { type: "string" }, ...NONE },
    aliases: { type: "object", additionalProperties: { type: "string" }, ...NONE },
    nickname: { anyOf: [{ type: "string" }, { type: "null" }], ...NONE },
    profile: { $ref: "#/definitions/Profile" },
    members: { type: "array", items: { $ref: "#/definitions/Member" } },
    // Safety rail: the keyword is ignored on anything but texts
    meta: { type: "object", ...NONE },
    count: { type: "number", ...NONE },
    owner: { type: "string", ...NONE },
    __hash: { type: "string", ...NONE }
  },
  definitions: {
    Profile: {
      type: "object",
      properties: { bio: { type: "string", ...NONE }, motto: { type: "string" } }
    },
    Member: {
      type: "object",
      properties: { name: { type: "string", ...NONE }, role: { type: "string" } },
      required: ["name"]
    }
  }
};

const TEAM_NOTE_SCHEMA: any = {
  type: "object",
  properties: {
    uuid: { type: "string" },
    team: { type: "string" },
    title: { type: "string", ...NONE },
    body: { type: "string" }
  }
};

const ECHO_SCHEMA: any = {
  type: "object",
  properties: {
    payload: {
      type: "object",
      properties: { title: { type: "string", ...NONE }, body: { type: "string" } }
    }
  },
  required: ["payload"]
};

/**
 * Minimal metadata for a model registered at runtime
 * @param id - the model identifier
 * @param schema - its input schema
 * @param relations - its relations
 * @returns the metadata
 */
function metadata(id: string, schema: any, relations: any = {}): any {
  return {
    Identifier: id,
    Ancestors: [],
    Subclasses: [],
    Relations: relations,
    PrimaryKey: ["uuid"],
    Events: [],
    Schemas: { Input: schema },
    Actions: {},
    Import: "",
    Plural: id.split("/").pop() + "s",
    Reflection: {}
  };
}

/**
 * Per-attribute opt-out of the input HTML sanitization (#1068), through the real REST path
 * (Router -> RESTOperationsTransport -> callOperation -> DomainService) and the other entry points
 */
@suite
class DomainServiceSanitizeTest extends WebdaApplicationTest {
  getTestConfiguration(): string | undefined {
    return process.cwd() + "/../../sample-app";
  }

  protected async buildWebda() {
    const core = await super.buildWebda();
    core.getBeans = () => {};
    core.registerBeans = () => {};
    const app = useApplication<Application>();
    for (const [id, schema] of Object.entries({
      "WebdaDemo/Team": TEAM_SCHEMA,
      "WebdaDemo/TeamNote": TEAM_NOTE_SCHEMA,
      "WebdaDemo/Echo.input": ECHO_SCHEMA
    })) {
      // Validated lazily from the application registry
      app.getSchemas()[id] = schema;
    }
    app.addModel("WebdaDemo/Team", Team, metadata("WebdaDemo/Team", TEAM_SCHEMA));
    app.addModel(
      "WebdaDemo/TeamNote",
      TeamNote,
      metadata("WebdaDemo/TeamNote", TEAM_NOTE_SCHEMA, { parent: { attribute: "team", model: "WebdaDemo/Team" } })
    );
    const router = new Router("Router", new RouterParameters().load({}));
    this.registerService(router);
    router.resolve();
    await router.init();
    return core;
  }

  async beforeAll(init: boolean = true) {
    await super.beforeAll(init);
    // A service operation whose whole body is one argument (`rest.body`)
    const domain: any = useDynamicService<DomainService>("DomainService");
    domain.echoPayload = async function echoPayload(payload: any) {
      return payload;
    };
    registerOperation("Sanitize.Echo", {
      service: "DomainService",
      method: "echoPayload",
      input: "WebdaDemo/Echo.input",
      rest: { method: "post", path: "sanitize/echo", body: "payload" }
    } as any);
    const transport = new RESTOperationsTransport(
      "SanitizeTransport",
      new RESTOperationsTransportParameters().load({ url: "/s/", exposeOpenAPI: false })
    );
    this.registerService(transport);
    transport.resolve();
    await transport.init();
  }

  async beforeEach() {
    await super.beforeEach();
    registerRepository(Team, new MemoryRepository(Team, ["uuid"]));
    registerRepository(TeamNote, new MemoryRepository(TeamNote, ["uuid"]));
    await Team.create({ uuid: "team-a", displayName: "Initial", description: "Initial" } as any);
  }

  /**
   * Run a request through the Router
   * @param method - HTTP method
   * @param url - URL
   * @param body - request body
   * @returns the status code and the parsed body (the error message when refused)
   */
  async request(method: HttpMethodType, url: string, body?: any): Promise<{ status: number; body: any }> {
    const httpContext = new HttpContext("test.webda.io", method, url, "http", 80, {});
    if (body !== undefined) {
      httpContext.setBody(body);
    }
    httpContext.setClientIp("127.0.0.1");
    const ctx = new WebContext(httpContext);
    ctx.newSession();
    ctx.getSession().login("user", "user");
    let status = 0;
    let error: string | undefined;
    await runWithContext(ctx, async () => {
      try {
        await useRouter().execute(ctx);
        status = ctx.statusCode;
      } catch (err) {
        if (err instanceof WebdaError.HttpError) {
          status = err.getResponseCode();
          error = err.message;
        } else {
          throw err;
        }
      }
    });
    const raw = <string>ctx.getResponseBody() || error;
    let parsed: any = raw;
    try {
      parsed = raw ? JSON.parse(raw) : undefined;
    } catch {
      // keep raw
    }
    return { status, body: parsed };
  }

  /**
   * An operation context carrying a JSON body
   * @param body - the body
   * @returns the context
   */
  async context(body: any): Promise<SimpleOperationContext> {
    const ctx = new SimpleOperationContext();
    await ctx.init();
    ctx.setInput(Buffer.from(JSON.stringify(body)));
    return ctx;
  }

  @test
  async taggedTextIsStoredAsSent() {
    for (const text of PLAIN_TEXTS) {
      const created = await this.request("POST", "/s/teams", { displayName: text, description: text });
      assert.strictEqual(created.status, 200, JSON.stringify(created.body));
      const stored: any = await Team.ref(created.body.uuid).get();
      assert.strictEqual(stored.displayName, text, "the tagged attribute is kept verbatim");
      assert.strictEqual(created.body.displayName, text);
      assert.notStrictEqual(stored.description, text, "the untagged attribute is still sanitized");
      // The same on update and patch
      const patched = await this.request("PATCH", `/s/teams/${created.body.uuid}`, {
        displayName: `${text} 2`,
        description: `${text} 2`
      });
      assert.strictEqual(patched.status, 200, JSON.stringify(patched.body));
      const updated = await this.request("PUT", `/s/teams/${created.body.uuid}`, { displayName: `${text} 3` });
      assert.strictEqual(updated.status, 200, JSON.stringify(updated.body));
      assert.strictEqual((await Team.ref(created.body.uuid).get()).displayName, `${text} 3`);
    }
    // What the default sanitization stores, as listed in the issue
    const untagged = await this.request("POST", "/s/teams", { description: "R&D" });
    assert.strictEqual(untagged.status, 200);
    assert.strictEqual((await Team.ref(untagged.body.uuid).get()).description, "R&amp;D");
    const cut = await this.request("PATCH", `/s/teams/${untagged.body.uuid}`, { description: "Tom <3 Jerry" });
    assert.strictEqual(cut.status, 200);
    assert.ok(!(await Team.ref(untagged.body.uuid).get()).description.includes("<"));
  }

  @test
  async storedTextIsTheValidatedOne() {
    // #1068, reproduction 1: the sanitized form ("Ax") is valid, the text itself holds BEL and RIGHT-TO-LEFT OVERRIDE
    const res = await this.request("PATCH", "/s/teams/team-a", {
      displayName: 'A<i title="\u0007‮">x</i>'
    });
    assert.strictEqual(res.status, 400, "the text that would be stored is the one validated");
    assert.match(JSON.stringify(res.body), /displayName/);
    assert.strictEqual((await Team.ref("team-a").get()).displayName, "Initial", "nothing stored");
    // Control characters alone are refused the same way
    assert.strictEqual((await this.request("PATCH", "/s/teams/team-a", { displayName: "A\u0007" })).status, 400);
  }

  @test
  async validRawTextIsAccepted() {
    // #1068, reproduction 2: sanitized to "R&amp;D " (trailing space), this failed a "no surrounding space" pattern
    const res = await this.request("PATCH", "/s/teams/team-a", { displayName: "R&D <team>" });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.displayName, "R&D <team>");
    assert.strictEqual((await Team.ref("team-a").get()).displayName, "R&D <team>");
    // The pattern still applies, to the text as sent
    assert.strictEqual((await this.request("PATCH", "/s/teams/team-a", { displayName: "R&D " })).status, 400);
  }

  @test
  async oneObjectIsValidatedAuthorizedAndUsed() {
    const ctx = await this.context({ uuid: "one", displayName: "R&D <team>", profile: { bio: "a && b" } });
    let seen: any;
    const domain: any = useDynamicService<DomainService>("DomainService");
    const getModelInput = domain.getModelInput;
    domain.getModelInput = async function spy(context: any) {
      seen = await getModelInput.call(this, context);
      return seen;
    };
    try {
      await callOperation(ctx, "Team.Create");
    } finally {
      domain.getModelInput = getModelInput;
    }
    const resolved = ctx.getExtension<any>("operationResolvedInput");
    assert.strictEqual(resolved.displayName, "R&D <team>", "validated and authorized on the text as sent");
    assert.strictEqual(seen.displayName, "R&D <team>");
    // The model input is the body the operation validated, not a second read of it
    assert.strictEqual(seen, await ctx.getInput());
    assert.strictEqual(seen.profile, resolved.profile);
    assert.strictEqual(await readOperationBody(ctx, "Team.Create"), seen);
  }

  @test
  async nestedTextsArraysAndRecords() {
    const res = await this.request("POST", "/s/teams", {
      labels: ["R&D", "<b>bold</b>"],
      aliases: { short: "a && b" },
      nickname: "Tom <3 Jerry",
      profile: { bio: "A-->B", motto: "R&D" },
      members: [
        { name: "R&D", role: "R&D" },
        { name: "Tom <3 Jerry", role: "<b>lead</b>" }
      ],
      summary: "R&D",
      notes: "R&D"
    });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const stored: any = await Team.ref(res.body.uuid).get();
    assert.deepStrictEqual(stored.labels, ["R&D", "<b>bold</b>"]);
    assert.deepStrictEqual(stored.aliases, { short: "a && b" });
    assert.strictEqual(stored.nickname, "Tom <3 Jerry");
    assert.deepStrictEqual(stored.profile, { bio: "A-->B", motto: "R&amp;D" });
    assert.deepStrictEqual(stored.members, [
      { name: "R&D", role: "R&amp;D" },
      { name: "Tom <3 Jerry", role: "lead" }
    ]);
    // `text` is the default by name, an unknown profile falls back to it
    assert.strictEqual(stored.summary, "R&amp;D");
    assert.strictEqual(stored.notes, "R&amp;D");
  }

  @test
  async safetyRails() {
    // The keyword does nothing on a free-form object or a number
    assert.deepStrictEqual(getModelRawTextPaths(Team).sort(), [
      "aliases.*",
      "displayName",
      "labels.*",
      "members.*.name",
      "nickname",
      "owner",
      "profile.bio"
    ]);
    const res = await this.request("POST", "/s/teams", {
      displayName: "R&D",
      meta: { html: "<script>alert(1)</script>R&D", deep: { text: "<b>x</b>" } },
      owner: "<b>me</b>",
      __hash: "R&D"
    });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const stored: any = await Team.ref(res.body.uuid).get();
    assert.deepStrictEqual(stored.meta, { html: "R&amp;D", deep: { text: "x" } });
    // Protected and private attributes are stripped, tagged or not
    assert.strictEqual(stored.owner, undefined);
    assert.strictEqual(stored.__hash, undefined);
    // A value that is not a text is never kept as sent: here the schema refuses it
    const object = await this.request("POST", "/s/teams", { displayName: { html: "<b>x</b>" } });
    assert.strictEqual(object.status, 400);
    const items = await this.request("POST", "/s/teams", { labels: [["<b>x</b>"]] });
    assert.strictEqual(items.status, 400);
    // ... and without a schema to refuse it, it is sanitized like any other value
    assert.deepStrictEqual(
      await sanitizeModelText(Team as any, { displayName: { html: "<b>x</b>" }, labels: [["<i>y</i>"], "R&D"] }),
      { displayName: { html: "x" }, labels: [["y"], "R&D"] }
    );
  }

  @test
  async nestedCreateKeepsTheInjectedParent() {
    // The transport writes the parent in the body it reads before calling the operation
    const res = await this.request("POST", "/s/teams/team-a/teamNotes", { title: "R&D <draft>", body: "R&D" });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const stored: any = await TeamNote.ref(res.body.uuid).get();
    assert.strictEqual(stored.team, "team-a");
    assert.strictEqual(stored.title, "R&D <draft>");
    assert.strictEqual(stored.body, "R&amp;D");
  }

  @test
  async serviceOperationInputSchema() {
    // The opt-out comes from the operation input schema: a service operation gets it like a model one
    const ctx = await this.context({ payload: { title: "R&D <x>", body: "R&D" } });
    await callOperation(ctx, "Sanitize.Echo");
    assert.deepStrictEqual(JSON.parse(ctx.getOutput()), { title: "R&D <x>", body: "R&amp;D" });
    // Over REST the whole body is the `payload` argument: the paths are relative to it
    const res = await this.request("POST", "/s/sanitize/echo", { title: "a && b", body: "a && b" });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.deepStrictEqual(res.body, { title: "a && b", body: "a &amp;&amp; b" });
  }

  @test
  async otherEntryPoints() {
    // What a caller outside the operations (an offline push, an import) applies to model data
    const input = {
      displayName: "R&D <team>",
      description: "R&D <team>",
      labels: ["a && b"],
      owner: "me",
      __hash: "x"
    };
    const text = await sanitizeModelText(Team as any, input);
    assert.deepStrictEqual(text, {
      displayName: "R&D <team>",
      description: "R&amp;D ",
      labels: ["a && b"],
      owner: "me",
      __hash: "x"
    });
    assert.deepStrictEqual(sanitizeModelInput(Team as any, text), {
      displayName: "R&D <team>",
      description: "R&amp;D ",
      labels: ["a && b"]
    });
    // Sanitizing twice changes nothing: an input already sanitized by the transport can go through it
    assert.deepStrictEqual(await sanitizeModelText(Team as any, { ...text }), text);
    // A class that is not a registered model keeps nothing
    assert.deepStrictEqual(getModelRawTextPaths(class Unknown {}), []);
    assert.deepStrictEqual(await sanitizeModelText(class Unknown {} as any, { displayName: "R&D" }), {
      displayName: "R&amp;D"
    });
  }

  @test
  async rawTextPaths() {
    assert.deepStrictEqual(getRawTextPaths(undefined), []);
    assert.deepStrictEqual(getRawTextPaths("string"), []);
    // The root of an input is not an attribute
    assert.deepStrictEqual(getRawTextPaths({ type: "string", ...NONE }), []);
    const node: any = {
      type: "object",
      properties: {
        label: { type: ["string", "null"], ...NONE },
        // A recursive definition is followed once
        children: { type: "array", items: { $ref: "#/definitions/Node" } },
        // Tuples, nested arrays and records of arrays inherit the opt-out
        pair: { type: "array", items: [{ type: "string" }, { type: "number" }], ...NONE },
        grid: { type: "array", items: { type: "array", items: { type: "string" } }, ...NONE },
        index: { type: "object", additionalProperties: { type: "array", items: { type: "string" } }, ...NONE },
        // ... an object with declared properties does not: each attribute is tagged on its own
        box: {
          type: "object",
          properties: { text: { type: "string" } },
          additionalProperties: { type: "string" },
          ...NONE
        },
        // In a mixed union only a string is kept: the path is listed, an object sent there is sanitized
        mixed: { anyOf: [{ type: "string" }, { type: "object" }], ...NONE },
        loose: { anyOf: [{ type: "string" }, true], ...NONE },
        nothing: { anyOf: [{ type: "null" }], ...NONE },
        either: { oneOf: [{ type: "object", properties: { text: { type: "string", ...NONE } } }, { type: "null" }] },
        // A name that reads as a path or a wildcard stays sanitized
        "a.b": { type: "string", ...NONE },
        "*": { type: "string", ...NONE },
        __private: { type: "string", ...NONE },
        open: { type: "object", additionalProperties: true, ...NONE }
      }
    };
    const schema = { $ref: "#/definitions/Node", definitions: { Node: node } };
    assert.deepStrictEqual(getRawTextPaths(node, schema).sort(), [
      "either.text",
      "grid.*.*",
      "index.*.*",
      "label",
      "loose",
      "mixed",
      "pair.*"
    ]);
    assert.deepStrictEqual(await sanitizeInput({ mixed: { html: "<b>x</b>" } }, { rawText: ["mixed"] }), {
      mixed: { html: "x" }
    });
    // Walked once per schema object
    const fresh = { type: "object", properties: { text: { type: "string", ...NONE } } };
    assert.strictEqual(getRawTextPaths(fresh), getRawTextPaths(fresh));
    // An endless nesting stops
    const deep: any = { type: "array", ...NONE };
    let cursor = deep;
    for (let i = 0; i < 40; i++) {
      cursor.items = { type: "array" };
      cursor = cursor.items;
    }
    cursor.items = { type: "string" };
    assert.deepStrictEqual(getRawTextPaths({ type: "object", properties: { deep } }), []);
  }

  @test
  async inputCache() {
    const body = { title: "R&D", body: "R&D", meta: { title: "R&D" }, list: ["R&D"] };
    const ctx = await this.context(body);
    const plain = await ctx.getInput();
    assert.deepStrictEqual(plain, { title: "R&amp;D", body: "R&amp;D", meta: { title: "R&amp;D" }, list: ["R&amp;D"] });
    assert.strictEqual(await ctx.getInput(), plain, "cached");
    assert.strictEqual(await ctx.getInput({ rawText: [] }), plain, "no text kept: the same sanitization");
    // Other texts to keep: the body is read again
    const kept = await ctx.getInput({ allowedTags: [], allowedAttributes: {}, rawText: ["title", "list.*"] });
    assert.notStrictEqual(kept, plain);
    assert.deepStrictEqual(kept, { title: "R&D", body: "R&amp;D", meta: { title: "R&amp;D" }, list: ["R&D"] });
    assert.strictEqual(await ctx.getInput({ rawText: ["list.*", "title"] }), kept, "same paths: cached");
    assert.strictEqual(await ctx.getInput(), kept, "a plain read returns the body already read");
    // `raw` keeps its meaning: the whole value of a key, read again every time
    const legacy = await ctx.getInput({ allowedTags: [], allowedAttributes: {}, raw: ["meta"] });
    assert.deepStrictEqual(legacy, { title: "R&amp;D", body: "R&amp;D", meta: { title: "R&D" }, list: ["R&amp;D"] });
    assert.notStrictEqual(await ctx.getInput({ rawText: [] }), legacy);
    assert.deepStrictEqual(await ctx.getInput({ raw: true }), body);
    // A cleared input stays cleared
    ctx.clearInput();
    assert.deepStrictEqual(await ctx.getInput({ rawText: ["title"] }), {});
    ctx.reinit();
    assert.deepStrictEqual(await ctx.getInput({ rawText: ["title"] }), { ...plain, title: "R&D" });
    // Prototype pollution vectors are dropped, kept texts or not
    const polluted = await sanitizeInput(JSON.parse('{"a":{"__proto__":{"x":1},"constructor":"c","b":"<b>t</b>"}}'), {
      rawText: ["a.constructor"]
    });
    assert.deepStrictEqual(Object.keys(polluted.a), ["b"]);
    assert.strictEqual(await sanitizeInput("<b>text</b>"), "text");
  }
}
