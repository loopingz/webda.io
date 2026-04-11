import { suite, test } from "@webda/test";
import * as assert from "assert";
import { resolve } from "node:path";
import { WebdaApplicationTest } from "@webda/core/lib/test/application.js";
import { TestApplication } from "@webda/core/lib/test/objects.js";
import { listOperations } from "@webda/core/lib/core/operations.js";
import { useRouter } from "@webda/core/lib/rest/hooks.js";
import { useApplication } from "@webda/core/lib/application/hooks.js";

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
    app.getCurrentConfiguration().services.RESTOperationsTransport = {
      type: "Webda/RESTOperationsTransport"
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
    assert.ok(serviceNames.includes("RESTOperationsTransport"), "RESTOperationsTransport should be initialized");
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
    assert.ok(routePaths.includes("/posts/{uuid}"), "Should have /posts/{uuid} route");
    assert.ok(routePaths.includes("/users"), "Should have /users route");
    assert.ok(routePaths.includes("/users/{uuid}"), "Should have /users/{uuid} route");
    assert.ok(routePaths.includes("/tags"), "Should have /tags route");
    assert.ok(routePaths.includes("/tags/{uuid}"), "Should have /tags/{uuid} route");
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

    assert.ok(props.email, "User schema should have email");
    assert.strictEqual(props.email.format, "email", "Email should have email format");

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
