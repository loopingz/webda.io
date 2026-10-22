// Cold boot of the blog-system application in a fresh Node process, the way `webda serve` and the serverless
// entrypoints boot it: import the framework, load the application, create and initialize the Core, then serve the
// first requests through the Router.
//
// Run by coldboot.bench.ts: prints one JSON line with the time of each phase, in ms since the process started
// (performance.now() counts from performance.timeOrigin, set when Node starts the process), and the init time of each
// service. Can also be run alone to profile a boot: `node bench/coldboot-child.mjs` (set NODE_COMPILE_CACHE to a folder
// to measure with the Node compile cache, as the `webda` launcher does).
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { blogStore, loadBlogModule } from "./stores.mjs";

const appDir = resolve(import.meta.dirname, "..");
const folder = mkdtempSync(join(tmpdir(), "webda-coldboot-"));
const phases = { processStart: 0 };
const mark = name => {
  phases[name] = Math.round(performance.now() * 1000) / 1000;
};
mark("scriptStart");

const webda = await import("@webda/core");
mark("frameworkImported");

const {
  UnpackedApplication,
  Core,
  runWithInstanceStorage,
  useInstanceStorage,
  useRouter,
  WebContext,
  HttpContext,
  runWithContext
} = webda;

/**
 * Run a request through the Router
 *
 * @param {string} method - HTTP method
 * @param {string} url - path
 * @param {any} body - JSON body
 * @returns {Promise<number>} the status
 */
async function request(method, url, body) {
  const httpContext = new HttpContext("coldboot.webda.io", method, url, "http", 80, {});
  if (body !== undefined) httpContext.setBody(body);
  const ctx = new WebContext(httpContext);
  ctx.newSession();
  let status = 200;
  await runWithContext(ctx, async () => {
    try {
      await useRouter().execute(ctx);
      status = ctx.statusCode || 200;
    } catch (err) {
      status = err?.statusCode || 500;
    }
  });
  return status;
}

let services = 0;
let core;
/**
 * Duration of each Service.init(), in ms
 * @type {Record<string, number>}
 */
const serviceInit = {};
try {
  await runWithInstanceStorage({}, async () => {
    // The application as shipped: only the store module under test, see loadBlogModule
    class BlogApplication extends UnpackedApplication {
      filterModule(filename) {
        return loadBlogModule(filename);
      }
    }
    const app = new BlogApplication(appDir);
    useInstanceStorage().application = app;
    await app.load();
    mark("applicationLoaded");
    // Same configuration as the other blog benchmarks: the store under test, binaries in a temporary folder
    const configuration = app.getCurrentConfiguration().services;
    configuration.Registry = blogStore().config(join(folder, "store"));
    configuration.Images = { ...configuration.Images, folder: join(folder, "images") };
    core = new Core(app);
    // resolve() creates and resolves every service, init() then only initializes them (resolve is cached)
    await core.resolve();
    mark("coreResolved");
    // Services are sealed: time them through Core.initService(name)
    const initService = core.initService;
    core.initService = async function timedInitService(name) {
      const start = performance.now();
      try {
        return await initService.call(this, name);
      } finally {
        serviceInit[name] = Math.round((performance.now() - start) * 1000) / 1000;
      }
    };
    await core.init();
    services = Object.keys(core.getServices()).length;
    mark("coreInitialized");
    const first = await request("PUT", "/posts", { q: "status = 'published' ORDER BY publishedAt DESC LIMIT 20" });
    mark("firstRequest");
    const second = await request("PUT", "/posts", { q: "status = 'published' ORDER BY publishedAt DESC LIMIT 20" });
    mark("secondRequest");
    if (first >= 400 || second >= 400) {
      throw new Error(`requests failed: ${first} ${second}`);
    }
    await core.stop();
  });
  process.stdout.write(
    `\n${JSON.stringify({ phases, services, serviceInit, rssBytes: process.memoryUsage().rss, node: process.version })}\n`
  );
} finally {
  rmSync(folder, { recursive: true, force: true });
}
// Some services keep handles open (pools, timers): the measurement is done
process.exit(0);
