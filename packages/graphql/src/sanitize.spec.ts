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
  useContext,
  useCoreEvents,
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
import {
  createFromInput,
  modelOperationError,
  operationError,
  updateFromInput,
  validateModelInput
} from "./mutations.js";
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

/**
 * Model whose schema constrains its attributes, open to everybody
 */
class Product extends CoreModel {
  name?: string;
  price?: number;
  kind?: string;
  email?: string;
  code?: any;
  static canAct(): boolean {
    return true;
  }
}
Product.registerSerializer(true, "GraphQLSanitizeProduct");

const PRODUCT_SCHEMA: any = {
  type: "object",
  properties: {
    uuid: { type: "string" },
    name: { type: "string", pattern: "^[A-Z][A-Za-z &]*$", minLength: 2, "x-webda-sanitize": "none" },
    price: { type: "number", maximum: 100 },
    kind: { type: "string", enum: ["a", "b"] },
    email: { type: "string", format: "email" },
    // No GraphQL type describes it: only the schema refuses a wrong value
    code: { anyOf: [{ type: "number" }, { type: "string", pattern: "^x" }] }
  },
  required: ["name"],
  additionalProperties: false
};

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
   * Stands for the delete operation of a model: records the key it is called with
   */
  modelDelete() {
    EchoService.received.push(useContext<WebContext>().getParameters());
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
    app.getSchemas()["WebdaDemo/Product"] = PRODUCT_SCHEMA;
    app.addModel("WebdaDemo/Product", Product, {
      Identifier: "WebdaDemo/Product",
      Ancestors: [],
      Subclasses: [],
      Relations: {},
      PrimaryKey: ["uuid"],
      Events: [],
      Schemas: { Input: PRODUCT_SCHEMA },
      Actions: {},
      Import: "",
      Plural: "Products",
      Reflection: {}
    } as any);
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
    for (const object of [
      ...(await Article.query("LIMIT 1000")).results,
      ...(await Product.query("LIMIT 1000")).results
    ]) {
      await object.delete();
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
  async queryStringsBehaveTheSameEverywhere() {
    const { callOperation, SimpleOperationContext } = await import("@webda/core");
    const rd = (await this.send("POST", "/api/articles", { summary: "R&D", title: "R&D", tags: ["a && b"] })).uuid;
    const zed = (await this.send("POST", "/api/articles", { summary: "Zed <b>x</b>", title: "Zed <b>x</b>" })).uuid;
    const keys = (res: any) => res.results.map((article: any) => article.uuid).sort();
    /**
     * @param q - a WebdaQL query
     * @returns the rows found over REST (PUT body), the operation called directly (gRPC, MCP) and GraphQL (a
     * variable and a literal of the document)
     */
    const everywhere = async (q: string): Promise<any[]> => {
      const rest = await this.send("PUT", "/api/articles", { q }).then(keys, err => err.message);
      const ctx = new SimpleOperationContext();
      await ctx.init();
      ctx.setSession(new Session());
      ctx.setInput(Buffer.from(JSON.stringify({ query: q })));
      const direct = await callOperation(ctx, "Articles.Query").then(
        () => keys(JSON.parse(ctx.getOutput())),
        err => err.message
      );
      const variable = await this.send("POST", "/graphql", {
        query: `query ($q: String) { Articles(query: $q) { results { uuid } } }`,
        variables: { q }
      });
      const literal = await this.send("POST", "/graphql", {
        query: `{ Articles(query: ${JSON.stringify(q)}) { results { uuid } } }`
      });
      return [
        rest,
        direct,
        ...[variable, literal].map(res => (res.errors ? res.errors[0].message : keys(res.data.Articles)))
      ];
    };
    // `summary` has the default sanitization (stored escaped), `title` is `@sanitize none` (stored as written)
    const cases: [string, string[]][] = [
      ["summary > 'S'", [zed]],
      ["summary < 'S'", [rd]],
      ["title >= 'S' AND title <= 'Zz'", [zed]],
      ["summary = 'R&D'", [rd]],
      ["title = 'R&D'", [rd]],
      ["title = 'Zed <b>x</b>'", [zed]],
      ["summary = 'Zed <b>x</b>'", [zed]],
      ["summary = 'Zed x'", [zed]],
      ['title = "R&D"', [rd]],
      ["title != 'R&D'", [zed]],
      ["summary LIKE 'R&%'", [rd]],
      ["title LIKE 'Zed <b>_</b>'", [zed]],
      ["summary IN ['R&D', 'nope']", [rd]],
      ["title IN ['R&D', 'Zed <b>x</b>']", [rd, zed].sort()],
      ["tags CONTAINS 'a && b'", [rd]],
      ["title = 'R&amp;D'", []]
    ];
    for (const [q, expected] of cases) {
      for (const [i, found] of (await everywhere(q)).entries()) {
        assert.deepStrictEqual(found, expected, `${q} over ${["REST", "the operation", "a variable", "a literal"][i]}`);
      }
    }
    // A query that does not parse: the same message everywhere, without the query in it
    assert.deepStrictEqual(await everywhere("summary = = '<b>'"), Array(4).fill("Query syntax error"));
    // The filter of a list of links and a sub-query follow the same rule (see parseFilter)
    const filter = await this.service.parseFilter("title = 'R&D' AND summary = 'R&D'", Article);
    assert.strictEqual(filter!.eval(await Article.ref(rd).get()), true);
    assert.strictEqual(filter!.eval(await Article.ref(zed).get()), false);
    assert.strictEqual(await this.service.parseFilter(""), undefined);
    // A field list is still refused by GraphQL (the selection set chooses the fields), accepted over REST
    const selecting = await everywhere("SELECT title WHERE title = 'R&D'");
    assert.deepStrictEqual(selecting.slice(0, 2), [[rd], [rd]]);
    for (const refused of selecting.slice(2)) {
      assert.match(String(refused), /SELECT field lists are not accepted/);
    }
    // A subscription on the list without query: every article
    const context = await this.newContext<WebContext>();
    context.setSession(new Session());
    const subscription = this.service.schema.getSubscriptionType()!.getFields().Articles;
    const iterator: any = await subscription.subscribe!(undefined, {}, context, undefined as any);
    assert.strictEqual((await iterator.next()).value.Articles.results.length, 2);
    await iterator.return?.();
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

  /**
   * Create a product over REST
   * @param payload - the body
   * @returns the created product, or the error of the refusal
   */
  async restCreate(payload: any): Promise<{ created?: any; error?: WebdaError.HttpError }> {
    try {
      return { created: await this.send("POST", "/api/products", payload) };
    } catch (error) {
      return { error: error as WebdaError.HttpError };
    }
  }

  /**
   * The stored attributes of a product, without its key
   * @param uuid - its key
   * @returns the attributes
   */
  async product(uuid: string): Promise<any> {
    const { uuid: _uuid, ...attributes } = JSON.parse(JSON.stringify(await Product.ref(uuid).get()));
    return attributes;
  }

  @test
  async modelMutationsValidateLikeRest() {
    const create = `mutation ($product: ProductInput) { createProduct(Product: $product) { uuid } }`;
    const update = `mutation ($product: ProductInput, $uuid: String) { updateProduct(Product: $product, uuid: $uuid) { uuid } }`;
    // payload, and whether the model schema accepts it
    const cases: Record<string, [any, boolean]> = {
      valid: [{ name: "Alpha & Co", price: 10, kind: "a", email: "a@b.io", code: "x1" }, true],
      pattern: [{ name: "alpha" }, false],
      "pattern on the text as sent": [{ name: "Alpha <b>" }, false],
      minLength: [{ name: "A" }, false],
      maximum: [{ name: "Alpha", price: 1000 }, false],
      enum: [{ name: "Alpha", kind: "z" }, false],
      format: [{ name: "Alpha", email: "nope" }, false],
      // GraphQL has no type for `code` (an Object scalar): only the schema can refuse it
      "wrong type in a free-form value": [{ name: "Alpha", code: "nope" }, false],
      "free-form value of the other type": [{ name: "Alpha", code: 12 }, true],
      // `<Model>.Create` ignores the required attributes, on every transport
      "missing required attribute": [{ price: 1 }, true]
    };
    for (const [name, [payload, accepted]] of Object.entries(cases)) {
      const rest = await this.restCreate(payload);
      const variables = await this.send("POST", "/graphql", { query: create, variables: { product: payload } });
      const literals = await this.send("POST", "/graphql", {
        query: `mutation { createProduct(Product: ${this.literal(payload)}) { uuid } }`
      });
      assert.strictEqual(rest.error === undefined, accepted, name);
      for (const answer of [variables, literals]) {
        assert.strictEqual(answer.errors === undefined, accepted, `${name}: ${JSON.stringify(answer.errors)}`);
        if (accepted) {
          // The same stored object
          assert.deepStrictEqual(
            await this.product(answer.data.createProduct.uuid),
            await this.product(rest.created.uuid)
          );
        } else {
          // The same refusal: a 400 with the validation errors, not a null result nor an internal error
          assert.strictEqual(answer.data.createProduct, null);
          assert.strictEqual(answer.errors[0].message, rest.error!.message, name);
          assert.strictEqual(answer.errors[0].extensions.code, "BAD_USER_INPUT");
          assert.deepStrictEqual(answer.errors[0].extensions.details, JSON.parse(JSON.stringify(rest.error!.details)));
          assert.strictEqual(rest.error!.getResponseCode(), 400);
        }
      }
    }
    assert.strictEqual((await Product.query("LIMIT 1000")).results.length, 9, "nothing stored by a refused create");
    // An attribute the schema does not know: refused by the schema over REST, by the input type over GraphQL
    assert.match((await this.restCreate({ name: "Alpha", extra: "x" })).error!.message, /additional properties/);
    const unknown = await this.send("POST", "/graphql", {
      query: create,
      variables: { product: { name: "Alpha", extra: "x" } }
    });
    assert.match(unknown.errors[0].message, /unknown field "extra"/);
    assert.strictEqual((await Product.query("LIMIT 1000")).results.length, 9);

    // Update: absent attributes are accepted, the ones sent are validated
    const viaRest = (await this.restCreate({ name: "Rest", price: 1 })).created.uuid;
    const viaGraphQL = (await this.gql(create, { product: { name: "Rest", price: 1 } })).createProduct.uuid;
    await this.send("PATCH", `/api/products/${viaRest}`, { price: 5 });
    await this.gql(update, { uuid: viaGraphQL, product: { price: 5 } });
    assert.deepStrictEqual(await this.product(viaGraphQL), { name: "Rest", price: 5 });
    assert.deepStrictEqual(await this.product(viaGraphQL), await this.product(viaRest));
    const restRefusal: any = await this.send("PATCH", `/api/products/${viaRest}`, { name: "bad" }).catch(e => e);
    const refusal = await this.send("POST", "/graphql", {
      query: update,
      variables: { uuid: viaGraphQL, product: { name: "bad" } }
    });
    assert.strictEqual(refusal.errors[0].extensions.code, "BAD_USER_INPUT");
    assert.strictEqual(refusal.errors[0].message.replace("Update", "Patch"), restRefusal.message);
    assert.deepStrictEqual(await this.product(viaGraphQL), await this.product(viaRest), "nothing changed");
    // A key in the input that is not the one of the object, a missing object
    const mismatch = await this.send("POST", "/graphql", {
      query: update,
      variables: { uuid: viaGraphQL, product: { uuid: viaRest, price: 6 } }
    });
    const restMismatch: any = await this.send("PATCH", `/api/products/${viaRest}`, { uuid: viaGraphQL }).catch(e => e);
    assert.strictEqual(mismatch.errors[0].extensions.code, "BAD_USER_INPUT");
    assert.strictEqual(mismatch.errors[0].message.replace("Update", "Patch"), restMismatch.message);
    assert.match(restMismatch.message, /uuid conflicts with path parameter/);
    const missing = await this.send("POST", "/graphql", { query: update, variables: { uuid: "nope", product: {} } });
    assert.strictEqual(missing.errors[0].extensions.code, "NOT_FOUND");
    // Delete is the model operation too
    const remove = `mutation ($uuid: String) { deleteProduct(uuid: $uuid) { success } }`;
    assert.deepStrictEqual((await this.gql(remove, { uuid: viaGraphQL })).deleteProduct, { success: true });
    assert.strictEqual(await Product.ref(viaGraphQL).exists(), false);
    const gone = await this.send("POST", "/graphql", { query: remove, variables: { uuid: viaGraphQL } });
    assert.strictEqual(gone.errors[0].extensions.code, "NOT_FOUND");
  }

  @test
  async modelMutationsAreTheModelOperations() {
    // What the audit log listens to: a GraphQL mutation is the operation the other transports call
    const called: string[] = [];
    const stop = useCoreEvents("Webda.OperationSuccess", (evt: any) => {
      called.push(evt.operationId);
    });
    try {
      const { uuid } = (await this.gql(`mutation { createProduct(Product: { name: "Audit" }) { uuid } }`))
        .createProduct;
      await this.gql(`mutation ($uuid: String) { updateProduct(uuid: $uuid, Product: { price: 2 }) { uuid } }`, {
        uuid
      });
      await this.gql(`mutation ($uuid: String) { deleteProduct(uuid: $uuid) { success } }`, { uuid });
    } finally {
      stop();
    }
    assert.deepStrictEqual(called, ["Product.Create", "Product.Update", "Product.Delete"]);

    // The key of an update or a delete is a parameter of the operation, named after the primary key of the model
    class Pair {}
    class Single {}
    EchoService.received = [];
    registerOperation("Pairs.Delete", {
      service: "Echo",
      method: "modelDelete",
      input: "void",
      output: "void",
      context: { model: Pair, pkFields: ["left", "right"] }
    } as any);
    registerOperation("Singles.Delete", {
      service: "Echo",
      method: "modelDelete",
      input: "void",
      output: "void",
      context: { model: Single }
    } as any);
    const context = await this.newContext<WebContext>();
    context.setSession(new Session());
    assert.notStrictEqual(
      await this.service.callModelOperation(Pair, "modelDelete", context, undefined, '["l","r"]'),
      undefined
    );
    assert.notStrictEqual(
      await this.service.callModelOperation(Single, "modelDelete", context, undefined, "key"),
      undefined
    );
    assert.deepStrictEqual(EchoService.received, [{ left: "l", right: "r" }, { uuid: "key" }]);
    // A model no DomainService exposes has no operation: the caller applies the mutation itself
    assert.strictEqual(await this.service.callModelOperation(Pair, "modelCreate", context, {}), undefined);
    // An existing key is a conflict, other failures are mapped like any operation error
    assert.strictEqual(modelOperationError(new WebdaError.Conflict("exists")).extensions.code, "CONFLICT");
    assert.strictEqual(modelOperationError(new WebdaError.NotFound("x")).extensions.code, "NOT_FOUND");
    assert.deepStrictEqual(operationError(new WebdaError.BadRequest("plain")).extensions, { code: "BAD_USER_INPUT" });
  }

  @test
  async mutationsWithoutModelOperationValidateToo() {
    // The path of a model no DomainService exposes: the same validator, the same error
    const context = await this.newContext<WebContext>();
    context.setSession(new Session());
    const refused = (fn: () => Promise<unknown>) =>
      fn().then(
        () => undefined,
        err => err
      );
    const pattern = await refused(() => createFromInput(Product, { name: "alpha" }, context));
    const rest = await this.restCreate({ name: "alpha" });
    assert.strictEqual(pattern.message, rest.error!.message);
    assert.strictEqual(pattern.extensions.code, "BAD_USER_INPUT");
    assert.deepStrictEqual(pattern.extensions.details, JSON.parse(JSON.stringify(rest.error!.details)));
    assert.strictEqual((await Product.query("LIMIT 10")).results.length, 0);
    const created = await createFromInput(Product, { name: "Alpha & Co", code: 1 }, context);
    assert.strictEqual(created.name, "Alpha & Co");
    const wrong = await refused(() => updateFromInput(Product, created.uuid, { code: "nope" }, context));
    assert.match(wrong.message, /^Product\.Update InvalidInput: \/code/);
    assert.strictEqual((await Product.ref(created.uuid).get()).code, 1);
    assert.strictEqual((await updateFromInput(Product, created.uuid, { price: 3 }, context)).price, 3);
    // Models without registered DomainService CRUD operations do not expose GraphQL CRUD mutations
    const { useInstanceStorage } = await import("@webda/core");
    const operations = useInstanceStorage().operations!;
    const saved = {
      create: operations["Product.Create"],
      update: operations["Product.Update"],
      delete: operations["Product.Delete"]
    };
    delete operations["Product.Create"];
    delete operations["Product.Update"];
    delete operations["Product.Delete"];
    try {
      this.service.generateSchema();
      const mutationFields = (this.service as any).schema.getMutationType()?.getFields() ?? {};
      assert.strictEqual(mutationFields.createProduct, undefined);
      assert.strictEqual(mutationFields.updateProduct, undefined);
      assert.strictEqual(mutationFields.deleteProduct, undefined);
    } finally {
      operations["Product.Create"] = saved.create;
      operations["Product.Update"] = saved.update;
      operations["Product.Delete"] = saved.delete;
      this.service.generateSchema();
    }
    // Nothing to validate against: a class that is not a model, a model without schema
    validateModelInput(class NotAModel {}, "Create", { any: "thing" });
    validateModelInput({ Metadata: {} }, "Create", { any: "thing" });
    validateModelInput({ Metadata: { Identifier: "WebdaDemo/NoSchema" } }, "Create", { any: "thing" });
  }
}
