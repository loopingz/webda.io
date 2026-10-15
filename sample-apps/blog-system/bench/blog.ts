import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { WebdaApplicationTest } from "@webda/core/lib/test/application.js";
import { TestApplication } from "@webda/core/lib/test/objects.js";
import { useRouter } from "@webda/core/lib/rest/hooks.js";
import { WebContext } from "@webda/core/lib/contexts/webcontext.js";
import { HttpContext, type HttpMethodType } from "@webda/core/lib/contexts/httpcontext.js";
import { runWithContext } from "@webda/core/lib/contexts/execution.js";
import { Router, RouterParameters } from "@webda/core/lib/rest/router.service.js";
import * as WebdaError from "@webda/core/lib/errors/errors.js";
import { useService } from "@webda/core";
import { blogStore, loadBlogModule } from "./stores.mjs";

export { BLOG_STORES } from "./stores.mjs";

/**
 * Folder of the blog-system application
 */
export const appDir = resolve(import.meta.dirname, "..");

/**
 * Blog application loaded from its folder, in the WebdaSample namespace
 */
export class BlogBenchApplication extends TestApplication {
  /**
   * @param appPath - application folder
   */
  constructor(appPath: string) {
    super(appPath);
  }

  /**
   * @override
   */
  getNamespace() {
    return "WebdaSample";
  }

  /**
   * Skip the store modules installed for the benchmarks but not under test
   *
   * @param filename - path of the webda.module.json
   * @returns true when the module must be loaded
   */
  filterModule(filename: string): boolean {
    return loadBlogModule(filename);
  }
}

/**
 * Response of {@link BlogBench.request}
 */
export interface BlogResponse {
  /**
   * HTTP status
   */
  status: number;
  /**
   * Parsed JSON body, or the raw body
   */
  body: any;
}

/**
 * Base of the blog benchmarks: the blog-system application with every model in the store under test
 *
 * Requests go through the Router in the process, like `test/api-test.ts`: routing, operation resolution, input
 * validation, permissions (`canAct`, `getPermissionQuery`), audit and the store, without the network.
 */
export class BlogBench extends WebdaApplicationTest {
  /**
   * Keep the AuditService of the configuration
   */
  audit = true;
  /**
   * Store under test, from `WEBDA_BENCH_BLOG_STORE` (see stores.mjs)
   */
  store = blogStore();
  /**
   * Temporary folder for the file based store and binaries
   */
  folder = mkdtempSync(join(tmpdir(), "webda-bench-blog-"));

  /**
   * Backend name of the results
   *
   * @returns the store backend name
   */
  get backend(): string {
    return this.store.backend;
  }

  /**
   * Remove the data of a previous run: persistent stores keep it, and the seed is deterministic
   */
  async resetStore() {
    await (useService("Registry" as any) as any).__clean?.();
  }

  /**
   * The blog application folder
   *
   * @returns the folder
   */
  getTestConfiguration(): string {
    return appDir;
  }

  /**
   * @override
   */
  getApplication() {
    return new BlogBenchApplication(this.getTestConfiguration());
  }

  /**
   * Store every model in the store under test, keep binaries in the temporary folder, drop the network servers
   *
   * @param app - the application
   */
  async tweakApp(app: any) {
    const services = app.getCurrentConfiguration().services;
    services.Registry = this.store.config(join(this.folder, "store"));
    services.Images = { ...services.Images, folder: join(this.folder, "images") };
    // No listening servers nor remote transports: requests go through the Router
    for (const name of ["HttpServer", "HttpServerH2c", "GRPCService", "MCP", "WebUI"]) {
      delete services[name];
    }
    if (!this.audit) {
      delete services.AuditService;
    }
    services.RESTService = { type: "Webda/RESTOperationsTransport", exposeOpenAPI: false };
  }

  /**
   * Add the Router: the HTTP server that usually creates it is removed
   *
   * @returns the core
   */
  protected async buildWebda() {
    const core = await super.buildWebda();
    const router = new Router("Router", new RouterParameters().load({}));
    this.registerService(router);
    router.resolve();
    await router.init();
    return core;
  }

  /**
   * Remove the temporary folder
   */
  async afterAll() {
    await super.afterAll();
    rmSync(this.folder, { recursive: true, force: true });
  }

  /**
   * Run a request through the Router
   *
   * @param method - HTTP method
   * @param url - path
   * @param body - JSON body
   * @param user - logs the session in as this user id
   * @returns the status and body
   */
  async request(method: HttpMethodType, url: string, body?: any, user?: string): Promise<BlogResponse> {
    const httpContext = new HttpContext("bench.webda.io", method, url, "http", 80, {});
    if (body !== undefined) {
      httpContext.setBody(body);
    }
    httpContext.setClientIp("127.0.0.1");
    const ctx = new WebContext(httpContext);
    ctx.newSession();
    if (user) {
      ctx.getSession().login(user, "email");
    }
    let status = 200;
    await runWithContext(ctx, async () => {
      try {
        await useRouter().execute(ctx);
        status = ctx.statusCode || 200;
      } catch (err) {
        status = err instanceof WebdaError.HttpError ? err.statusCode || 500 : 500;
      }
    });
    const raw = ctx.getResponseBody() as string;
    let parsed: any = raw;
    if (raw) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        // Not JSON
      }
    }
    return { status, body: parsed };
  }

  /**
   * Run a request and fail on an error status
   *
   * @param method - HTTP method
   * @param url - path
   * @param body - JSON body
   * @param user - logs the session in as this user id
   * @returns the body
   */
  async expectOk(method: HttpMethodType, url: string, body?: any, user?: string): Promise<any> {
    const res = await this.request(method, url, body, user);
    if (res.status >= 400) {
      throw new Error(
        `${method} ${url} → ${res.status} ${typeof res.body === "string" ? res.body : JSON.stringify(res.body)}`
      );
    }
    return res.body;
  }
}
