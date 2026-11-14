import { suite, test } from "@webda/test";
import {
  CoreModel,
  DomainService,
  registerOperation,
  RESTOperationsTransport,
  RESTOperationsTransportParameters,
  Service,
  ServiceParameters,
  Session,
  useApplication,
  useService,
  WebContext,
  WebdaError
} from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test/application.js";
import { TestApplication } from "@webda/core/lib/test/objects.js";
import * as assert from "assert";
import {
  graphql,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  parse,
  subscribe,
  type ExecutionResult
} from "graphql";
import { GraphQLService } from "./graphql.service.js";
import { RAW_ARGS, sanitizeArguments, sanitizeFieldArguments } from "./sanitize.js";
import { AnyScalarType } from "./types/any.js";

/**
 * Model with one attribute per sanitization mode, open to everybody
 */
class Article extends CoreModel {
  title?: string;
  summary?: string;
  body?: string;
  content?: string;
  tags?: string[];
  static canAct(): boolean {
    return true;
  }
}
Article.registerSerializer(true, "GraphQLSanitizeArticle");

const ARTICLE_SCHEMA: any = {
  type: "object",
  properties: {
    uuid: { type: "string" },
    title: { type: "string", "x-webda-sanitize": "none" },
    summary: { type: "string" },
    body: { type: "string", "x-webda-sanitize": "markdown" },
    content: { type: "string", "x-webda-sanitize": "html" },
    tags: { type: "array", items: { type: "string" }, "x-webda-sanitize": "none" }
  }
};

const NOTE_SCHEMA: any = {
  type: "object",
  properties: {
    note: {
      type: "object",
      properties: {
        title: { type: "string", "x-webda-sanitize": "none" },
        text: { type: "string" },
        md: { type: "string", "x-webda-sanitize": "markdown" }
      }
    },
    plain: { type: "string" },
    anything: {}
  }
};

/**
 * A service whose operations answer what they received
 */
class EchoService extends Service {
  static received: any[] = [];

  /**
   * @param params - raw parameters
   * @returns parameters
   */
  loadParameters(params: any): ServiceParameters {
    return new ServiceParameters().load(params);
  }

  /**
   * @param note - an object with tagged texts
   * @param plain - a text
   * @param anything - a free-form value
   * @returns the arguments, as received
   */
  echo(note: any, plain: string, anything: any) {
    EchoService.received.push({ note, plain, anything });
    return { note, plain, anything };
  }

  /**
   * @param note - an object with tagged texts
   * @param plain - a text
   * @param anything - a free-form value
   * @yields the arguments, as received
   */
  async *feed(note: any, plain: string, anything: any) {
    EchoService.received.push({ note, plain, anything });
    yield { note, plain, anything };
  }
}

/** One text per mode, each holding what the modes treat differently */
const PAYLOAD = {
  title: "R&D <team> && a-->b",
  summary: "R&D <b>bold</b> a < b",
  body: "# R&D\n\n> a < b `<b>`\n\n<script>alert(1)</script>\n\n[x](javascript:alert(1))",
  content: '<p onclick="x">R&D <b>b</b><script>x</script></p>',
  tags: ["a && b", "<i>"]
};

/** What every transport stores for {@link PAYLOAD} */
const STORED = {
  title: "R&D <team> && a-->b",
  summary: "R&amp;D bold a &lt; b",
  body: "# R&D\n\n> a < b `<b>`\n\n&lt;script>alert(1)&lt;/script>\n\n[x](#)",
  content: "<p>R&amp;D <b>b</b></p>",
  tags: ["a && b", "<i>"]
};

const FIELDS = "uuid title summary body content tags";

/**
 * GraphQL sanitizes like the other transports: the arguments the resolvers receive, not the request as a whole
 */
@suite
class GraphQLSanitizeTest extends WebdaApplicationTest {
  /** Whether the field of "another service" is registered */
  contributed = false;

  /** @returns the application configuration */
  getTestConfiguration(): any {
    return {
      services: {
        Echo: { type: "Webda/EchoService" },
        DomainService: { type: "Webda/DomainService" },
        GraphQL: {
          type: "Webda/GraphQLService",
          exposeMe: false,
          exposeGraphiQL: false,
          globalSubscription: true,
          exposeOperations: ["Sanitize.*"]
        }
      }
    };
  }

  /**
   * Register the model and the services of the test
   * @param app - the test application
   */
  async tweakApp(app: TestApplication): Promise<void> {
    await super.tweakApp(app);
    app
      .addModda("Webda/EchoService", EchoService)
      .addModda("Webda/DomainService", DomainService)
      .addModda("Webda/GraphQLService", GraphQLService);
    app.getSchemas()["WebdaDemo/Article"] = ARTICLE_SCHEMA;
    app.getSchemas()["Sanitize.Echo.input"] = NOTE_SCHEMA;
    app.addModel("WebdaDemo/Article", Article, {
      Identifier: "WebdaDemo/Article",
      Ancestors: [],
      Subclasses: [],
      Relations: {},
      PrimaryKey: ["uuid"],
      Events: [],
      Schemas: { Input: ARTICLE_SCHEMA },
      Actions: {},
      Import: "",
      Plural: "Articles",
      Reflection: {}
    } as any);
  }

  /** Register the operations, then the REST transport that serves them and the model operations */
  async beforeAll(): Promise<void> {
    await super.beforeAll();
    this.registerOperations();
    const transport = new RESTOperationsTransport(
      "Rest",
      new RESTOperationsTransportParameters().load({ url: "/api/", exposeOpenAPI: false })
    );
    this.registerService(transport);
    transport.resolve();
    await transport.init();
  }

  /** Start from no article, and a schema holding the operations and a field of another service */
  async beforeEach(): Promise<void> {
    await super.beforeEach();
    for (const article of (await Article.query("LIMIT 1000")).results) {
      await article.delete();
    }
    EchoService.received = [];
    this.registerOperations();
    if (!this.contributed) {
      this.contributed = true;
      // What another service does to add its own fields: here one whose arguments nothing describes
      (this.service as any).on("Webda.GraphQL.Schema", (evt: any) => {
        evt.rootFields.customEcho = {
          type: GraphQLString,
          args: { text: { type: GraphQLString }, data: { type: AnyScalarType } },
          resolve: (_: any, args: any) => JSON.stringify(args)
        };
      });
    }
    this.service.generateSchema();
  }

  /** Register the operations of the Echo service */
  registerOperations(): void {
    const schemas = useApplication().getSchemas();
    schemas["Sanitize.Chunk"] = <any>{ type: "object", "x-webda-stream": true };
    schemas["Sanitize.Echo.output"] = <any>{ type: "object" };
    registerOperation("Sanitize.Echo", {
      service: "Echo",
      method: "echo",
      input: "Sanitize.Echo.input",
      output: "Sanitize.Echo.output",
      rest: { method: "post", path: "sanitize/echo" }
    } as any);
    registerOperation("Sanitize.Feed", {
      service: "Echo",
      method: "feed",
      input: "Sanitize.Echo.input",
      output: "Sanitize.Chunk"
    } as any);
  }

  /** @returns the service under test */
  get service(): GraphQLService {
    return useService("GraphQL" as any) as unknown as GraphQLService;
  }

  /**
   * Send a JSON body through the router
   * @param method - HTTP method
   * @param url - URL
   * @param body - the body, sent as it is when it is a string
   * @returns the JSON answer
   */
  async send(method: "POST" | "PUT" | "PATCH" | "GET", url: string, body?: any): Promise<any> {
    const context = await this.newContext<WebContext>();
    context.setSession(new Session());
    return this.http({
      method,
      url,
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: { "content-type": "application/json; charset=utf-8" },
      context
    });
  }

  /**
   * Send a GraphQL request over HTTP POST
   * @param query - GraphQL document
   * @param variables - its variables
   * @returns the JSON answer
   */
  async gql(query: string, variables?: any): Promise<any> {
    const res = await this.send("POST", "/graphql", { query, variables });
    assert.strictEqual(res.errors, undefined, JSON.stringify(res.errors));
    return res.data;
  }

  /**
   * Send GraphQL requests over the WebSocket protocol (graphql-ws), without a network
   * @param requests - the documents and their variables
   * @returns the payloads the server sent for each request
   */
  async ws(...requests: { query: string; variables?: any }[]): Promise<any[][]> {
    const context = await this.newContext<WebContext>();
    context.setSession(new Session());
    context.setExtension("graphql", { count: 0 });
    const sent: any[] = [];
    let onMessage: (data: string) => Promise<void>;
    const closed = (this.service as any).wsHandler.opened(
      {
        protocol: "graphql-transport-ws",
        send: async (data: string) => {
          sent.push(JSON.parse(data));
        },
        close: () => {},
        onMessage: (cb: (data: string) => Promise<void>) => (onMessage = cb)
      },
      { context }
    );
    await onMessage!(JSON.stringify({ type: "connection_init" }));
    for (const [i, payload] of requests.entries()) {
      await onMessage!(JSON.stringify({ id: `${i}`, type: "subscribe", payload }));
    }
    await closed(1000, "done");
    return requests.map((_, i) =>
      sent
        .filter(message => message.id === `${i}`)
        .map(message => {
          assert.notStrictEqual(message.type, "error", JSON.stringify(message));
          return message.payload;
        })
        .filter(payload => payload !== undefined)
    );
  }

  /**
   * A GraphQL literal for a JSON value
   * @param value - the value
   * @returns the literal
   */
  literal(value: any): string {
    if (Array.isArray(value)) return `[${value.map(v => this.literal(v)).join(", ")}]`;
    if (value && typeof value === "object") {
      return `{${Object.entries(value)
        .map(([k, v]) => `${k}: ${this.literal(v)}`)
        .join(", ")}}`;
    }
    return JSON.stringify(value);
  }

  /**
   * The stored attributes of an article
   * @param uuid - its key
   * @returns the attributes of {@link PAYLOAD}
   */
  async stored(uuid: string): Promise<any> {
    const article: any = await Article.ref(uuid).get();
    return Object.fromEntries(Object.keys(PAYLOAD).map(key => [key, article[key]]));
  }

  @test
  async modelMutationsStoreWhatRestStores() {
    const create = `mutation ($article: ArticleInput) { createArticle(Article: $article) { ${FIELDS} } }`;
    const update = `mutation ($article: ArticleInput, $uuid: String) { updateArticle(Article: $article, uuid: $uuid) { ${FIELDS} } }`;
    // The same payload through REST, GraphQL variables, GraphQL literals and the GraphQL WebSocket protocol
    const rest = await this.send("POST", "/api/articles", PAYLOAD);
    const variables = (await this.gql(create, { article: PAYLOAD })).createArticle;
    const literals = (await this.gql(`mutation { createArticle(Article: ${this.literal(PAYLOAD)}) { ${FIELDS} } }`))
      .createArticle;
    const [[socket]] = await this.ws({ query: create, variables: { article: PAYLOAD } });
    assert.deepStrictEqual(await this.stored(rest.uuid), STORED);
    for (const created of [variables, literals, socket.data.createArticle]) {
      assert.notStrictEqual(created.uuid, rest.uuid);
      assert.deepStrictEqual(await this.stored(created.uuid), await this.stored(rest.uuid));
      assert.deepStrictEqual({ ...created, uuid: "" }, { ...STORED, uuid: "" }, "the same answer too");
    }
    // Each mode, and an untagged attribute, on its own
    for (const [attribute, text] of Object.entries(PAYLOAD)) {
      const viaRest = await this.send("POST", "/api/articles", { [attribute]: text });
      const viaGraphQL = (await this.gql(create, { article: { [attribute]: text } })).createArticle;
      assert.deepStrictEqual(
        (await this.stored(viaGraphQL.uuid))[attribute],
        (await this.stored(viaRest.uuid))[attribute]
      );
      assert.deepStrictEqual(viaGraphQL[attribute], STORED[attribute], attribute);
    }
    // The same on update, where a stored text is sent back
    const changes = Object.fromEntries(
      Object.entries(PAYLOAD).map(([key, value]) => [key, Array.isArray(value) ? [...value, "R&D"] : `${value}\n\nR&D`])
    );
    await this.send("PATCH", `/api/articles/${rest.uuid}`, changes);
    await this.gql(update, { uuid: variables.uuid, article: changes });
    await this.ws({ query: update, variables: { uuid: socket.data.createArticle.uuid, article: changes } });
    assert.deepStrictEqual(await this.stored(variables.uuid), await this.stored(rest.uuid));
    assert.deepStrictEqual(await this.stored(socket.data.createArticle.uuid), await this.stored(rest.uuid));
    assert.strictEqual((await this.stored(rest.uuid)).title, `${PAYLOAD.title}\n\nR&D`);
    const resent = await this.stored(rest.uuid);
    await this.gql(update, { uuid: variables.uuid, article: resent });
    assert.deepStrictEqual(await this.stored(variables.uuid), resent, "a stored text sent back is unchanged");
    // Without input, and with a key that is a text like any other
    assert.strictEqual((await this.gql(`mutation { createArticle { uuid title } }`)).createArticle.title, null);
    await Article.create({ uuid: "x", title: "X" } as any);
    assert.strictEqual(
      (await this.gql(`mutation { updateArticle(uuid: "<b>x</b>", Article: { summary: "s" }) { uuid } }`)).updateArticle
        .uuid,
      "x"
    );
  }

  @test
  async operationArgumentsFollowTheOperationInputSchema() {
    const input = {
      note: { title: "R&D <team>", text: "R&D <b>team</b>", md: "a < b <script>x</script>" },
      plain: "R&D <i>x</i>",
      anything: { html: "<b>t</b>", list: ["<u>y</u> & z"] }
    };
    const expected = {
      note: { title: "R&D <team>", text: "R&amp;D team", md: "a < b &lt;script>x&lt;/script>" },
      plain: "R&amp;D x",
      anything: { html: "t", list: ["y &amp; z"] }
    };
    const query = `mutation ($note: SanitizeEchoInput_note, $plain: String, $anything: Object) {
      sanitizeEcho(note: $note, plain: $plain, anything: $anything)
    }`;
    // REST, GraphQL variables, GraphQL literals, GraphQL over WebSocket: the operation receives the same input
    assert.deepStrictEqual(await this.send("POST", "/api/sanitize/echo", input), expected);
    assert.deepStrictEqual((await this.gql(query, input)).sanitizeEcho, expected);
    assert.deepStrictEqual(
      (
        await this.gql(
          `mutation { sanitizeEcho(note: ${this.literal(input.note)}, plain: ${this.literal(input.plain)}, anything: ${this.literal(input.anything)}) }`
        )
      ).sanitizeEcho,
      expected
    );
    const [[socket]] = await this.ws({ query, variables: input });
    assert.deepStrictEqual(socket.data.sanitizeEcho, expected);
    assert.deepStrictEqual(EchoService.received, [expected, expected, expected, expected]);
    // A streamed operation: the subscription arguments, alone and merged in the Aggregate subscription
    const feed = `subscription ($note: SanitizeFeedInput_note, $plain: String, $anything: Object) {
      sanitizeFeed(note: $note, plain: $plain, anything: $anything)
    }`;
    const [[chunk], [merged]] = await this.ws(
      { query: feed, variables: input },
      { query: `subscription { Aggregate { __typename sanitizeFeed(plain: "R&D <i>x</i>") } }` }
    );
    assert.deepStrictEqual(chunk.data.sanitizeFeed, expected);
    // In the Aggregate the arguments are literals handed to the subscription of the field: sanitized all the same
    assert.notStrictEqual(merged.data.Aggregate, undefined);
    assert.deepStrictEqual(EchoService.received.slice(4), [
      expected,
      { note: undefined, plain: "R&amp;D x", anything: undefined }
    ]);
    // The keys that reach a prototype are removed from the variables, here in a free-form value
    const polluted = await this.send(
      "POST",
      "/graphql",
      `{"query": "mutation ($anything: Object) { sanitizeEcho(anything: $anything) }",
        "variables": {"anything": {"__proto__": {"polluted": true}, "constructor": "c", "prototype": {}, "ok": "<b>t</b>"}}}`
    );
    assert.deepStrictEqual(polluted.data.sanitizeEcho.anything, { ok: "t" });
    assert.strictEqual(({} as any).polluted, undefined);
  }

  @test
  async everyOtherArgumentIsSanitizedAsText() {
    const a1 = (await this.send("POST", "/api/articles", { summary: "R&D", title: "R&D" })).uuid;
    await Article.create({ uuid: "x", summary: "Zed" } as any);
    // A key: `<b>x</b>` is the text `x`
    assert.strictEqual((await this.gql(`{ Article(uuid: "<b>x</b>") { uuid } }`)).Article.uuid, "x");
    assert.strictEqual(
      (await this.gql(`query ($id: String) { Article(uuid: $id) { uuid } }`, { id: "<i>x</i>" })).Article.uuid,
      "x"
    );
    // A WebdaQL query: sanitized as text like the `q` of a REST query (PUT body), then `<` and `>` are restored, so
    // comparisons work and a literal matches the texts stored with the default sanitization
    const uuids = async (query: string) =>
      (await this.gql(`query ($q: String) { Articles(query: $q) { results { uuid } } }`, { q: query })).Articles.results
        .map((a: any) => a.uuid)
        .sort();
    assert.deepStrictEqual(await uuids("summary = 'R&D'"), [a1]);
    assert.deepStrictEqual(await uuids("summary = '<b>R&D</b>'"), [a1]);
    assert.deepStrictEqual(await uuids("summary > 'S'"), ["x"]);
    assert.deepStrictEqual(await uuids("summary < 'S'"), [a1]);
    // A field another service adds, with arguments nothing describes
    assert.deepStrictEqual(
      JSON.parse(
        (
          await this.gql(`query ($data: Object) { customEcho(text: "<b>R&D</b>", data: $data) }`, {
            data: { html: "<i>x</i>", list: ["<u>y</u>"], n: 1 }
          })
        ).customEcho
      ),
      { text: "R&amp;D", data: { html: "x", list: ["y"], n: 1 } }
    );
    const [[custom]] = await this.ws({ query: `{ customEcho(text: "<script>x</script>a < b") }` });
    assert.deepStrictEqual(JSON.parse(custom.data.customEcho), { text: "a &lt; b" });
  }

  @test
  async entryPaths() {
    // The document is not sanitized as text anymore: its literals are, once parsed
    assert.strictEqual(
      (await this.gql(`mutation { createArticle(Article: { title: "a < b > c & d" }) { title } }`)).createArticle.title,
      "a < b > c & d"
    );
    // POST only: a GET on the endpoint serves GraphiQL (when exposed), it never executes a document
    await assert.rejects(
      () => this.send("GET", `/graphql?query=${encodeURIComponent("{ __typename }")}`),
      WebdaError.NotFound
    );
    // No batching: an array of requests is refused as a whole, nothing is executed
    const batch = await this.send("POST", "/graphql", [
      { query: `mutation { createArticle(Article: { title: "batch" }) { uuid } }` }
    ]);
    assert.strictEqual(batch?.data, undefined);
    assert.strictEqual((await Article.query("title = 'batch'")).results.length, 0);
    // A body that is not JSON, or no body at all, is no request
    for (const body of ["not json", ""]) {
      const res = await this.send("POST", "/graphql", body);
      assert.strictEqual(res?.data, undefined);
    }
    assert.strictEqual(await (this.service as any).readRequest({ getRawInputAsString: async () => "" }), undefined);
  }

  @test
  async sanitizedArguments() {
    const calls: Record<string, any> = {};
    const field = (extensions?: any) => ({
      type: GraphQLString,
      args: { text: { type: GraphQLString }, data: { type: AnyScalarType } },
      extensions,
      resolve: (_: any, args: any, _context: any, info: any) => {
        calls[info.fieldName] = args;
        return JSON.stringify(args);
      }
    });
    const build = () =>
      new GraphQLSchema({
        query: new GraphQLObjectType({
          name: "Query",
          fields: {
            plain: field(),
            raw: field({ [RAW_ARGS]: ["data"] }),
            noArgs: { type: GraphQLString, resolve: () => "ok" },
            // No resolver: graphql-js calls the method of the source with the arguments
            method: { type: GraphQLString, args: { text: { type: GraphQLString } } }
          }
        }),
        subscription: new GraphQLObjectType({
          name: "Subscription",
          fields: {
            ticks: {
              type: GraphQLString,
              args: { text: { type: GraphQLString } },
              subscribe: async function* ticks(_: any, args: any) {
                yield { ticks: args.text };
              }
            }
          }
        })
      });
    const schema = sanitizeFieldArguments(build());
    const fields = schema.getQueryType()!.getFields();
    const resolvers = [
      fields.plain.resolve,
      fields.method.resolve,
      schema.getSubscriptionType()!.getFields().ticks.subscribe
    ];
    assert.strictEqual(fields.noArgs.resolve!(undefined, {}, undefined, undefined as any), "ok", "left as it is");
    // Wrapping twice changes nothing
    sanitizeFieldArguments(schema);
    assert.deepStrictEqual(
      [fields.plain.resolve, fields.method.resolve, schema.getSubscriptionType()!.getFields().ticks.subscribe],
      resolvers
    );
    const variables = { data: { html: "<b>x</b>", when: "<i>now</i>" } };
    const result = await graphql({
      schema,
      source: `query ($data: Object) {
        plain(text: "<b>R&D</b>", data: $data)
        raw(text: "<b>R&D</b>", data: $data)
        noArgs
        method(text: "<b>m</b>")
        __type(name: "Query") { name }
      }`,
      variableValues: variables,
      rootValue: { method: (args: any) => `called with ${args.text}` }
    });
    assert.deepStrictEqual(result.errors, undefined);
    assert.deepStrictEqual(JSON.parse(result.data!.plain as string), {
      text: "R&amp;D",
      data: { html: "x", when: "now" }
    });
    // An argument the resolver sanitizes itself is handed over as received, the others are still sanitized
    assert.deepStrictEqual(JSON.parse(result.data!.raw as string), { text: "R&amp;D", data: variables.data });
    assert.strictEqual(calls.raw.data, variables.data);
    assert.notStrictEqual(calls.plain.data, variables.data);
    assert.strictEqual(result.data!.method, "called with m");
    // The variables of the request are not modified: another field can use them
    assert.deepStrictEqual(variables, { data: { html: "<b>x</b>", when: "<i>now</i>" } });
    const stream = (await subscribe({
      schema,
      document: parse(`subscription { ticks(text: "<b>t</b> & u") }`)
    })) as AsyncIterableIterator<ExecutionResult>;
    assert.deepStrictEqual({ ...(await stream.next()).value.data }, { ticks: "t &amp; u" });

    // Values that are not plain JSON are handed over as they are
    const date = new Date(0);
    assert.deepStrictEqual(await sanitizeArguments({ extensions: {} }, { when: date, text: "<b>t</b>" }), {
      when: date,
      text: "t"
    });
  }
}
