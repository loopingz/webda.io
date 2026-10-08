import { suite, test } from "@webda/test";
import * as assert from "assert";
import { resolve } from "node:path";
import { WebdaApplicationTest } from "@webda/core/lib/test/application.js";
import { TestApplication } from "@webda/core/lib/test/objects.js";
import { listOperations } from "@webda/core/lib/core/operations.js";
import { useRouter } from "@webda/core/lib/rest/hooks.js";
import { useApplication } from "@webda/core/lib/application/hooks.js";
import { WebContext } from "@webda/core/lib/contexts/webcontext.js";
import { HttpContext } from "@webda/core/lib/contexts/httpcontext.js";
import { runWithContext } from "@webda/core/lib/contexts/execution.js";
import { Router, RouterParameters } from "@webda/core/lib/rest/router.service.js";
import * as WebdaError from "@webda/core/lib/errors/errors.js";

const appDir = resolve(import.meta.dirname, "..");

/**
 * Integration tests for the blog-system application bootstrap.
 *
 * Verifies that the blog-system loads correctly through the Webda Core,
 * including model registration, service initialization, route setup,
 * and operation registration.
 */
@suite
class BlogSystemAppTest extends WebdaApplicationTest {
  getTestConfiguration(): string {
    return appDir;
  }

  getApplication() {
    return new BlogTestApplication(this.getTestConfiguration());
  }

  async tweakApp(app: any) {
    app.getCurrentConfiguration().services.Registry = {
      type: "Webda/MemoryStore"
    };
    // Add DomainService for operation registration and RESTOperationsTransport for route registration
    app.getCurrentConfiguration().services.DomainService = {
      type: "Webda/DomainService"
    };
    app.getCurrentConfiguration().services.RESTService = {
      type: "Webda/RESTOperationsTransport",
      exposeOpenAPI: true
    };
  }

  @test
  async modelsRegistered() {
    const app = useApplication();
    const models = app.getModels();
    const modelNames = Object.keys(models);
    assert.ok(modelNames.includes("WebdaSample/Post"), "Post model should be registered");
    assert.ok(modelNames.includes("WebdaSample/User"), "User model should be registered");
    assert.ok(modelNames.includes("WebdaSample/Tag"), "Tag model should be registered");
    assert.ok(modelNames.includes("WebdaSample/Comment"), "Comment model should be registered");
    assert.ok(modelNames.includes("WebdaSample/PostTag"), "PostTag model should be registered");
    assert.ok(modelNames.includes("WebdaSample/UserFollow"), "UserFollow model should be registered");
  }

  @test
  async servicesInitialized() {
    const services = this.webda.getServices();
    const serviceNames = Object.keys(services);
    assert.ok(serviceNames.includes("Router"), "Router service should be initialized");
    assert.ok(serviceNames.includes("Registry"), "Registry service should be initialized");
    assert.ok(serviceNames.includes("DomainService"), "DomainService should be initialized");
    assert.ok(serviceNames.includes("RESTService"), "RESTService should be initialized");
    assert.ok(serviceNames.includes("SessionManager"), "SessionManager service should be initialized");
    assert.ok(serviceNames.includes("CryptoService"), "CryptoService service should be initialized");
  }

  @test
  async routesRegistered() {
    const router = useRouter();
    // Force pathMap rebuild since Webda.Init event is not emitted during test init
    router.remapRoutes();
    const routes = router.routes;
    assert.ok(routes, "Router should have routes object");

    const routePaths = Object.keys(routes);
    // Verify REST routes for models
    assert.ok(routePaths.includes("/posts"), "Should have /posts route");
    assert.ok(routePaths.includes("/posts/{slug}"), "Should have /posts/{slug} route (slug is the primary key)");
    assert.ok(routePaths.includes("/users"), "Should have /users route");
    assert.ok(routePaths.includes("/users/{uuid}"), "Should have /users/{uuid} route");
    assert.ok(routePaths.includes("/tags"), "Should have /tags route");
    assert.ok(routePaths.includes("/tags/{slug}"), "Should have /tags/{slug} route (slug is the primary key)");
    assert.ok(routePaths.includes("/comments"), "Should have /comments route");
    assert.ok(routePaths.includes("/comments/{uuid}"), "Should have /comments/{uuid} route");
  }

  @test
  async postRouteMethods() {
    const router = useRouter();
    router.remapRoutes();
    const postRoutes = router.routes["/posts"];
    assert.ok(postRoutes, "/posts route should exist");
    const methods = postRoutes.flatMap(r => r.methods);
    assert.ok(methods.includes("PUT"), "/posts should support PUT (query)");
    assert.ok(methods.includes("POST"), "/posts should support POST (create)");
  }

  @test
  async userRouteMethods() {
    const router = useRouter();
    router.remapRoutes();
    const userRoutes = router.routes["/users/{uuid}"];
    assert.ok(userRoutes, "/users/{uuid} route should exist");
    const methods = userRoutes.flatMap(r => r.methods);
    assert.ok(methods.includes("GET"), "/users/{uuid} should support GET");
    assert.ok(methods.includes("PUT"), "/users/{uuid} should support PUT");
    assert.ok(methods.includes("PATCH"), "/users/{uuid} should support PATCH");
    assert.ok(methods.includes("DELETE"), "/users/{uuid} should support DELETE");
  }

  @test
  async actionRoutesRegistered() {
    const router = useRouter();
    router.remapRoutes();
    const routePaths = Object.keys(router.routes);
    // Post publish action
    assert.ok(routePaths.includes("/posts/{uuid}/publish"), "Should have /posts/{uuid}/publish action route");
    // User follow/unfollow actions
    assert.ok(routePaths.includes("/users/{uuid}/follow"), "Should have /users/{uuid}/follow action route");
    assert.ok(routePaths.includes("/users/{uuid}/unfollow"), "Should have /users/{uuid}/unfollow action route");
    // User static operations
    assert.ok(routePaths.includes("/users/login"), "Should have /users/login route");
    assert.ok(routePaths.includes("/users/logout"), "Should have /users/logout route");
  }

  @test
  async operationsRegistered() {
    const ops = listOperations();
    const opNames = Object.keys(ops);
    // Custom model operations should be registered
    assert.ok(opNames.includes("Post.Publish"), "Post.Publish operation should be registered");
    assert.ok(opNames.includes("User.Follow"), "User.Follow operation should be registered");
    assert.ok(opNames.includes("User.Unfollow"), "User.Unfollow operation should be registered");
    assert.ok(opNames.includes("User.Login"), "User.Login operation should be registered");
    assert.ok(opNames.includes("User.Logout"), "User.Logout operation should be registered");
  }

  @test
  async modelMetadata() {
    const app = useApplication();
    const postModel = app.getModels()["WebdaSample/Post"];
    assert.ok(postModel, "Post model should exist");
    assert.ok(postModel.Metadata, "Post should have Metadata");
    assert.strictEqual(postModel.Metadata.Plural, "Posts", "Post plural should be 'Posts'");
    assert.deepStrictEqual(postModel.Metadata.PrimaryKey, ["slug"], "Post primary key should be ['slug']");
    assert.ok(postModel.Metadata.Schemas, "Post should have Schemas");
    assert.ok(postModel.Metadata.Schemas.Input, "Post should have Input schema");

    const userModel = app.getModels()["WebdaSample/User"];
    assert.ok(userModel, "User model should exist");
    assert.ok(userModel.Metadata, "User should have Metadata");
    assert.strictEqual(userModel.Metadata.Plural, "Users", "User plural should be 'Users'");

    const tagModel = app.getModels()["WebdaSample/Tag"];
    assert.ok(tagModel, "Tag model should exist");
    assert.strictEqual(tagModel.Metadata.Plural, "Tags", "Tag plural should be 'Tags'");
    assert.deepStrictEqual(tagModel.Metadata.PrimaryKey, ["slug"], "Tag primary key should be ['slug']");
  }

  @test
  async postInputSchema() {
    const app = useApplication();
    const postModel = app.getModels()["WebdaSample/Post"];
    const inputSchema = postModel.Metadata.Schemas.Input;
    assert.ok(inputSchema, "Post Input schema should exist");

    // Verify field constraints
    const props = inputSchema.properties;
    assert.ok(props.title, "Post schema should have title");
    assert.strictEqual(props.title.minLength, 5, "Title minLength should be 5");
    assert.strictEqual(props.title.maxLength, 200, "Title maxLength should be 200");

    assert.ok(props.slug, "Post schema should have slug");
    assert.strictEqual(props.slug.minLength, 5, "Slug minLength should be 5");
    assert.strictEqual(props.slug.maxLength, 250, "Slug maxLength should be 250");
    assert.strictEqual(props.slug.pattern, "^[a-z0-9-]+$", "Slug should have pattern constraint");

    assert.ok(props.content, "Post schema should have content");
    assert.strictEqual(props.content.minLength, 10, "Content minLength should be 10");

    assert.ok(props.viewCount, "Post schema should have viewCount");
    assert.strictEqual(props.viewCount.minimum, 0, "ViewCount minimum should be 0");
  }

  @test
  async userInputSchema() {
    const app = useApplication();
    const userModel = app.getModels()["WebdaSample/User"];
    const inputSchema = userModel.Metadata.Schemas.Input;
    assert.ok(inputSchema, "User Input schema should exist");

    const props = inputSchema.properties;
    assert.ok(props.username, "User schema should have username");
    assert.strictEqual(props.username.minLength, 3, "Username minLength should be 3");
    assert.strictEqual(props.username.maxLength, 30, "Username maxLength should be 30");
    assert.strictEqual(props.username.pattern, "^[a-zA-Z0-9_]+$", "Username should have pattern constraint");

    // The email and the password hash are private fields (`__`): clients never send them (register does)
    assert.strictEqual(props.email, undefined, "the email is private");
    assert.strictEqual(props.password, undefined, "the password is set by register");

    assert.ok(props.name, "User schema should have name");
    assert.strictEqual(props.name.minLength, 2, "Name minLength should be 2");
    assert.strictEqual(props.name.maxLength, 50, "Name maxLength should be 50");
  }

  @test
  async openApiRoute() {
    const router = useRouter();
    router.remapRoutes();
    // The OpenAPI endpoint is at "/" (registered by RESTOperationsTransport)
    const rootRoutes = router.routes["/"];
    assert.ok(rootRoutes, "Root route should exist (OpenAPI)");
    const getMethods = rootRoutes.filter(r => r.methods.includes("GET"));
    assert.ok(getMethods.length > 0, "Root route should support GET (OpenAPI)");
  }
}

/**
 * HTTP integration tests.
 *
 * Verifies the three specific issues:
 * 1. GET /version should not duplicate the response body
 * 2. PUT /posts (query) should not return 500
 * 3. POST /posts (create) should not return 400 for valid input
 */
@suite
class BlogSystemHTTPTest extends WebdaApplicationTest {
  getTestConfiguration(): string {
    return appDir;
  }

  getApplication() {
    return new BlogTestApplication(this.getTestConfiguration());
  }

  async tweakApp(app: any) {
    app.getCurrentConfiguration().services.Registry = {
      type: "Webda/MemoryStore"
    };
    app.getCurrentConfiguration().services.DomainService = {
      type: "Webda/DomainService"
    };
    app.getCurrentConfiguration().services.RESTService = {
      type: "Webda/RESTOperationsTransport",
      exposeOpenAPI: false
    };
  }

  protected async buildWebda() {
    const core = await super.buildWebda();
    const router = new Router("Router", new RouterParameters().load({}));
    this.registerService(router);
    router.resolve();
    await router.init();
    return core;
  }

  /**
   * Run a request through the router
   * @param options - the request
   * @param options.method - the HTTP method
   * @param options.url - the URL
   * @param options.body - the body
   * @param options.headers - the headers
   * @param options.user - logs the session in as that user id (the way `login` does)
   * @returns the status, body and the context
   */
  async routerHttp<T = any>(options: {
    method: "GET" | "PUT" | "POST" | "PATCH" | "DELETE";
    url: string;
    body?: any;
    headers?: { [key: string]: string };
    user?: string;
  }): Promise<{ statusCode: number; body: string | undefined; parsed?: T; ctx: WebContext }> {
    const httpContext = new HttpContext(
      "test.webda.io",
      options.method,
      options.url,
      "http",
      80,
      options.headers || {}
    );
    if (options.body !== undefined) {
      httpContext.setBody(options.body);
    }
    httpContext.setClientIp("127.0.0.1");
    const ctx = new WebContext(httpContext);
    ctx.newSession();
    if (options.user) {
      ctx.getSession().login(options.user, "email");
    }
    let routeError: Error | undefined;
    await runWithContext(ctx, async () => {
      try {
        await useRouter().execute(ctx);
      } catch (err) {
        routeError = err instanceof Error ? err : new Error(String(err));
      }
    });
    if (routeError) {
      if (routeError instanceof WebdaError.HttpError) {
        return { statusCode: routeError.statusCode || 500, body: routeError.message, ctx };
      }
      return { statusCode: 500, body: routeError.message, ctx };
    }
    const body = ctx.getResponseBody() as string;
    let parsed: T | undefined;
    if (body) {
      try {
        parsed = JSON.parse(body);
      } catch {
        // Not JSON
      }
    }
    return { statusCode: ctx.statusCode || 200, body, parsed, ctx };
  }

  /**
   * Register a user through the API
   * @param username - the username
   * @returns the user id and its email/password
   */
  async register(username: string): Promise<{ uuid: string; email: string; password: string }> {
    const email = `${username}-${Date.now()}@example.com`;
    const password = `${username}-secret-1`;
    const res = await this.routerHttp<{ uuid: string }>({
      method: "PUT",
      url: "/users/register",
      body: { username, email, name: `${username} name`, password }
    });
    assert.strictEqual(res.statusCode, 200, res.body);
    return { uuid: res.parsed!.uuid, email, password };
  }

  /**
   * Create a post as a user
   * @param user - the author id
   * @param slug - the slug
   * @returns the response
   */
  async createPost(user: string, slug: string) {
    return this.routerHttp({
      method: "POST",
      url: "/posts",
      user,
      body: {
        title: "A post title",
        slug,
        content: "Content long enough for the post validation.",
        status: "draft",
        viewCount: 0
      }
    });
  }

  @test
  async auditRecordsPostHistory() {
    const slug = `audit-post-${Date.now()}`;
    const { uuid: alice } = await this.register("alice");
    const created = await this.createPost(alice, slug);
    assert.strictEqual(created.statusCode, 200, created.body);
    const patched = await this.routerHttp({
      method: "PATCH",
      url: `/posts/${slug}`,
      user: alice,
      body: { title: "Audited Post 2" }
    });
    assert.strictEqual(patched.statusCode, 200, patched.body);
    // Title shorter than @minLength 5: rejected and recorded as a failure
    const rejected = await this.routerHttp({
      method: "PATCH",
      url: `/posts/${slug}`,
      user: alice,
      body: { title: "x" }
    });
    assert.strictEqual(rejected.statusCode, 400, rejected.body);
    const deleted = await this.routerHttp({ method: "DELETE", url: `/posts/${slug}`, user: alice });
    assert.ok(deleted.statusCode < 300, deleted.body);

    // Deleted subject: readable through the sample's permissive readPermission
    const res = await this.routerHttp<{ results: any[] }>({
      method: "PUT",
      url: "/audit/subject",
      body: { model: "WebdaSample/Post", key: slug }
    });
    assert.strictEqual(res.statusCode, 200, res.body);
    // Entries can share a millisecond, so compare as a set (ordering is pinned in core tests)
    assert.deepStrictEqual(res.parsed!.results.map(e => `${e.operationId}:${e.success}`).sort(), [
      "Post.Create:true",
      "Post.Delete:true",
      "Post.Patch:false",
      "Post.Patch:true"
    ]);
    const failure = res.parsed!.results.find(e => !e.success);
    assert.match(failure.error, /title/);
  }

  @test
  async auditRecordsPublisherSubject() {
    const slug = `audit-publish-${Date.now()}`;
    const { uuid: alice } = await this.register("alice");
    const created = await this.createPost(alice, slug);
    assert.strictEqual(created.statusCode, 200, created.body);
    // A service operation: it declares the post it acts on
    const published = await this.routerHttp({ method: "PUT", url: "/publisher/publishpost", body: { postId: slug } });
    assert.strictEqual(published.statusCode, 200, published.body);
    // The history of an existing post is its author's (`Post.canAct(ctx, "audit")`): anyone else gets 403
    const other = await this.routerHttp({
      method: "PUT",
      url: "/audit/subject",
      body: { model: "WebdaSample/Post", key: slug }
    });
    assert.strictEqual(other.statusCode, 403, other.body);
    const res = await this.routerHttp<{ results: any[] }>({
      method: "PUT",
      url: "/audit/subject",
      user: alice,
      body: { model: "WebdaSample/Post", key: slug }
    });
    assert.strictEqual(res.statusCode, 200, res.body);
    assert.ok(
      res.parsed!.results.some(e => e.operationId === "Publisher.PublishPost" && e.success),
      `history: ${res.parsed!.results.map(e => e.operationId)}`
    );
  }

  @test
  async auditQueryListsEntries() {
    const res = await this.routerHttp<{ results: any[] }>({
      method: "PUT",
      url: "/audit/query",
      body: { q: "" }
    });
    assert.strictEqual(res.statusCode, 200, res.body);
    assert.ok(Array.isArray(res.parsed!.results));
  }

  @test
  async rootRedirectsToAdminUI() {
    const res = await this.routerHttp({ method: "GET", url: "/" });
    assert.strictEqual(res.statusCode, 302);
  }

  @test
  async unknownRouteIsNotFound() {
    const res = await this.routerHttp<{ error: { code: string } }>({ method: "GET", url: "/no-such-page" });
    assert.strictEqual(res.statusCode, 404);
    assert.strictEqual(res.parsed?.error.code, "NOT_FOUND");
  }

  @test
  async getVersionNoDuplicate() {
    // Issue 1: GET /version should return the package name ONCE, not doubled
    const res = await this.routerHttp({ method: "GET", url: "/version" });
    assert.ok(res.body, "GET /version should return a body");
    const expected = "@webda/sample-blog-system";
    assert.strictEqual(res.body, expected, `GET /version should return "${expected}" exactly once, got: "${res.body}"`);
  }

  @test
  async putPostsQueryNoError() {
    // Issue 2: PUT /posts with query body should NOT return 500
    const res = await this.routerHttp({
      method: "PUT",
      url: "/posts",
      body: { q: "" }
    });
    assert.ok(res.statusCode < 500, `PUT /posts should not return 500, got ${res.statusCode}: ${res.body}`);
  }

  @test
  async postPostsCreateNoSchemaReject() {
    // Issue 3: POST /posts with valid data should NOT return 400
    const { uuid: alice } = await this.register("alice");
    const res = await this.routerHttp({
      method: "POST",
      url: "/posts",
      user: alice,
      body: {
        title: "Hello World Post",
        slug: "hello-world-post",
        content: "This is a test post with enough content to meet the minimum length.",
        status: "draft",
        viewCount: 0
      }
    });
    // The operation should not fail with schema validation (400)
    // It may fail with 500 if no repository exists, but not with 400 (BadRequest)
    assert.ok(res.statusCode !== 400, `POST /posts should not return 400, got ${res.statusCode}: ${res.body}`);
  }

  // ---- Permission model of the sample ----

  /** Accounts: register (logged in at once), login with the password, no direct create */
  @test
  async registerAndLoginOpenTheSession() {
    const { uuid, email, password } = await this.register("carol");
    // Registration logs the new account in
    const other = await this.routerHttp({ method: "GET", url: `/users/${uuid}` });
    assert.strictEqual(other.statusCode, 200);
    // Login verifies the password and opens the session; the email is escaped in the lookup
    const login = await this.routerHttp({ method: "PUT", url: "/users/login", body: { email, password } });
    assert.strictEqual(login.statusCode, 200, login.body);
    assert.strictEqual(login.ctx.getCurrentUserId(), uuid);
    for (const bad of [
      { email, password: "wrong-password" },
      { email: `${email}' OR __email != '`, password }
    ]) {
      const refused = await this.routerHttp({ method: "PUT", url: "/users/login", body: bad });
      assert.strictEqual(refused.statusCode, 403, JSON.stringify(bad));
      assert.strictEqual(refused.ctx.getCurrentUserId(), undefined);
    }
    // Accounts are created with register only
    const direct = await this.routerHttp({
      method: "POST",
      url: "/users",
      body: { username: "direct", name: "Direct User" }
    });
    assert.strictEqual(direct.statusCode, 403, direct.body);
  }

  /** Users: public profile, private email and hash, owner-only changes */
  @test
  async usersAreReadableByAllAndEditableByTheirOwnerOnly() {
    const alice = await this.register("alice");
    const bob = await this.register("bob");
    // Profiles are public; the email is shown to its owner only; the password hash never
    const asBob = await this.routerHttp<any>({ method: "GET", url: `/users/${alice.uuid}`, user: bob.uuid });
    assert.strictEqual(asBob.statusCode, 200);
    assert.strictEqual(asBob.parsed.username, "alice");
    assert.strictEqual(asBob.parsed.email, undefined);
    assert.ok(!asBob.body!.includes("__password") && !asBob.body!.includes("__email"), asBob.body);
    const asAlice = await this.routerHttp<any>({ method: "GET", url: `/users/${alice.uuid}`, user: alice.uuid });
    assert.strictEqual(asAlice.parsed.email, alice.email);
    assert.ok(!asAlice.body!.includes("__password"));
    const list = await this.routerHttp<any>({ method: "PUT", url: "/users", user: bob.uuid, body: { q: "" } });
    assert.ok(!list.body!.includes("__password") && !list.body!.includes(alice.email));
    // Bob cannot change or delete Alice (readable, so 403), nor set her private fields
    for (const attempt of [
      { method: "PATCH" as const, body: { name: "pwned" } },
      { method: "PATCH" as const, body: { __password: "x", __email: "bob@evil.io" } },
      { method: "PUT" as const, body: { uuid: alice.uuid, username: "alice", name: "pwned" } },
      { method: "DELETE" as const, body: undefined }
    ]) {
      const res = await this.routerHttp({
        method: attempt.method,
        url: `/users/${alice.uuid}`,
        user: bob.uuid,
        body: attempt.body
      });
      assert.strictEqual(res.statusCode, 403, `${attempt.method} ${res.body}`);
    }
    assert.strictEqual((await this.routerHttp({ method: "DELETE", url: `/users/${alice.uuid}` })).statusCode, 403);
    // Alice still logs in with her password and keeps her name
    const login = await this.routerHttp({
      method: "PUT",
      url: "/users/login",
      body: { email: alice.email, password: alice.password }
    });
    assert.strictEqual(login.statusCode, 200);
    assert.strictEqual(
      (await this.routerHttp<any>({ method: "GET", url: `/users/${alice.uuid}` })).parsed.name,
      "alice name"
    );
    // Alice edits herself; a `__` field in her own input is ignored
    const own = await this.routerHttp<any>({
      method: "PATCH",
      url: `/users/${alice.uuid}`,
      user: alice.uuid,
      body: { name: "Alice Renamed", __password: "x" }
    });
    assert.strictEqual(own.statusCode, 200, own.body);
    assert.strictEqual(own.parsed.name, "Alice Renamed");
    assert.strictEqual(
      (
        await this.routerHttp({
          method: "PUT",
          url: "/users/login",
          body: { email: alice.email, password: alice.password }
        })
      ).statusCode,
      200,
      "the hash was not changed"
    );
    // The password changes through its own operation, with the current password
    const change = await this.routerHttp({
      method: "PUT",
      url: `/users/${alice.uuid}/changePassword`,
      user: alice.uuid,
      body: { current: alice.password, next: "alice-new-secret" }
    });
    assert.strictEqual(change.statusCode, 204, change.body);
    assert.strictEqual(
      (
        await this.routerHttp({
          method: "PUT",
          url: "/users/login",
          body: { email: alice.email, password: "alice-new-secret" }
        })
      ).statusCode,
      200
    );
    assert.strictEqual(
      (
        await this.routerHttp({
          method: "PUT",
          url: `/users/${alice.uuid}/changePassword`,
          user: bob.uuid,
          body: { current: "x", next: "yyyyyyyy" }
        })
      ).statusCode,
      403
    );
  }

  /** Posts, comments and tags: anyone reads, the author (or a logged-in user) writes */
  @test
  async postsAndCommentsBelongToTheirAuthor() {
    const alice = await this.register("alice");
    const bob = await this.register("bob");
    const slug = `perm-post-${Date.now()}`;
    // Anonymous cannot create; the author is the caller whatever the input says
    assert.strictEqual(
      (
        await this.routerHttp({
          method: "POST",
          url: "/posts",
          body: {
            title: "A post title",
            slug,
            content: "Content long enough for the post validation.",
            status: "draft",
            viewCount: 0
          }
        })
      ).statusCode,
      403
    );
    const created = await this.routerHttp<any>({
      method: "POST",
      url: "/posts",
      user: alice.uuid,
      body: {
        title: "A post title",
        slug,
        content: "Content long enough for the post validation.",
        status: "draft",
        viewCount: 0,
        author: bob.uuid
      }
    });
    assert.strictEqual(created.statusCode, 200, created.body);
    assert.strictEqual(created.parsed.author, alice.uuid);
    // Anyone reads, only Alice changes
    assert.strictEqual((await this.routerHttp({ method: "GET", url: `/posts/${slug}` })).statusCode, 200);
    assert.strictEqual(
      (await this.routerHttp({ method: "GET", url: `/posts/${slug}`, user: bob.uuid })).statusCode,
      200
    );
    assert.strictEqual(
      (
        await this.routerHttp({
          method: "PATCH",
          url: `/posts/${slug}`,
          user: bob.uuid,
          body: { title: "Bob was here" }
        })
      ).statusCode,
      403
    );
    assert.strictEqual(
      (await this.routerHttp({ method: "PATCH", url: `/posts/${slug}`, user: bob.uuid, body: { author: bob.uuid } }))
        .statusCode,
      403
    );
    assert.strictEqual(
      (await this.routerHttp({ method: "DELETE", url: `/posts/${slug}`, user: bob.uuid })).statusCode,
      403
    );
    assert.strictEqual(
      (
        await this.routerHttp({
          method: "PUT",
          url: `/posts/${slug}/publish`,
          user: bob.uuid,
          body: { destination: "twitter" }
        })
      ).statusCode,
      403
    );
    const read = await this.routerHttp<any>({ method: "GET", url: `/posts/${slug}` });
    assert.strictEqual(read.parsed.title, "A post title");
    assert.strictEqual(read.parsed.author, alice.uuid);
    assert.strictEqual(
      (
        await this.routerHttp({
          method: "PATCH",
          url: `/posts/${slug}`,
          user: alice.uuid,
          body: { title: "Alice edited" }
        })
      ).statusCode,
      200
    );
    // Comments: the same rule
    assert.strictEqual(
      (await this.routerHttp({ method: "POST", url: "/comments", body: { content: "anon", post: slug } })).statusCode,
      403
    );
    const comment = await this.routerHttp<any>({
      method: "POST",
      url: "/comments",
      user: bob.uuid,
      body: { content: "Nice post", post: slug, author: alice.uuid }
    });
    assert.strictEqual(comment.statusCode, 200, comment.body);
    assert.strictEqual(comment.parsed.author, bob.uuid);
    const id = comment.parsed.uuid;
    assert.strictEqual((await this.routerHttp({ method: "GET", url: `/comments/${id}` })).statusCode, 200);
    assert.strictEqual(
      (
        await this.routerHttp({
          method: "PATCH",
          url: `/comments/${id}`,
          user: alice.uuid,
          body: { content: "edited by alice" }
        })
      ).statusCode,
      403
    );
    assert.strictEqual(
      (await this.routerHttp({ method: "DELETE", url: `/comments/${id}`, user: alice.uuid })).statusCode,
      403
    );
    assert.strictEqual(
      (
        await this.routerHttp({
          method: "PATCH",
          url: `/comments/${id}`,
          user: bob.uuid,
          body: { content: "edited by bob" }
        })
      ).statusCode,
      200
    );
    assert.strictEqual(
      (await this.routerHttp({ method: "DELETE", url: `/comments/${id}`, user: bob.uuid })).statusCode,
      204
    );
    // Tags: readable by all, created by logged-in users, not editable
    assert.strictEqual(
      (await this.routerHttp({ method: "POST", url: "/tags", body: { name: "anon", slug: "anon-tag" } })).statusCode,
      403
    );
    assert.strictEqual(
      (
        await this.routerHttp({
          method: "POST",
          url: "/tags",
          user: bob.uuid,
          body: { name: "news", slug: `news-${Date.now()}` }
        })
      ).statusCode,
      200
    );
    const tags = await this.routerHttp<any>({ method: "PUT", url: "/tags", body: { q: "" } });
    assert.ok(tags.parsed.results.length >= 1);
    assert.strictEqual(
      (await this.routerHttp({ method: "DELETE", url: `/tags/${tags.parsed.results[0].slug}`, user: bob.uuid }))
        .statusCode,
      403
    );
  }
}

/**
 * Application class that loads the blog-system
 */
class BlogTestApplication extends TestApplication {
  constructor(appPath: string) {
    super(appPath);
  }

  getNamespace() {
    return "WebdaSample";
  }

  filterModule(_filename: string): boolean {
    return true;
  }
}
