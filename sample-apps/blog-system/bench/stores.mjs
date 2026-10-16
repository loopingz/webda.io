// Stores the blog benchmarks can run on, selected with WEBDA_BENCH_BLOG_STORE
//
// Plain JavaScript: shared by the vitest benchmarks and the cold boot child process (plain Node). Connections
// default to the CI services (see .github/workflows/ci.yml) and follow the same variables as the store harnesses.

/**
 * @typedef {object} BlogStore
 * @property {string} backend - backend name of the results
 * @property {(folder: string) => object} config - configuration of the Registry service
 */

/**
 * @type {Record<string, BlogStore>}
 */
export const BLOG_STORES = {
  memory: {
    backend: "MemoryStore",
    config: () => ({ type: "Webda/MemoryStore" })
  },
  fs: {
    backend: "FileStore",
    config: folder => ({ type: "Webda/FileStore", folder })
  },
  postgres: {
    backend: "PostgresStore",
    config: () => ({
      type: "Webda/PostgresStore",
      usePool: true,
      table: "blog_bench",
      postgresqlServer: {
        host: process.env.PGHOST || "localhost",
        port: Number(process.env.PGPORT || 5432),
        user: process.env.PGUSER || "webda.io",
        database: process.env.PGDATABASE || "webda.io",
        password: process.env.PGPASSWORD || "webda.io",
        max: 10
      }
    })
  },
  mongodb: {
    backend: "MongoStore",
    config: () => ({
      type: "Webda/MongoStore",
      mongoUrl: process.env.WEBDA_MONGO_URL || "mongodb://root:webda.io@localhost:37017",
      collection: "blog_bench"
    })
  }
};

/**
 * The store selected by WEBDA_BENCH_BLOG_STORE
 *
 * @param {string} [name] - store key, defaults to WEBDA_BENCH_BLOG_STORE then memory
 * @returns {BlogStore & { name: string }} the store
 */
export function blogStore(name = process.env.WEBDA_BENCH_BLOG_STORE || "memory") {
  const store = BLOG_STORES[name];
  if (!store) {
    throw new Error(`Unknown WEBDA_BENCH_BLOG_STORE '${name}', expected ${Object.keys(BLOG_STORES).join(", ")}`);
  }
  return { ...store, name };
}

/**
 * Modules of the stores that are not part of the blog application, installed for the benchmarks only
 */
const STORE_MODULES = {
  postgres: /[\\/](@webda[\\/]postgres|packages[\\/]postgres)[\\/]webda\.module\.json$/,
  mongodb: /[\\/](@webda[\\/]mongo|packages[\\/]mongodb)[\\/]webda\.module\.json$/
};

/**
 * Tell if a module must be loaded: the application loads every installed module, and each one costs boot time
 * even when no service uses it (about 25ms each), so the store modules not under test are skipped. The
 * application then boots like it would be shipped, with its store module only.
 *
 * @param {string} filename - path of the webda.module.json
 * @param {string} [store] - store key, defaults to WEBDA_BENCH_BLOG_STORE then memory
 * @returns {boolean} true when the module must be loaded
 */
export function loadBlogModule(filename, store = process.env.WEBDA_BENCH_BLOG_STORE || "memory") {
  return !Object.entries(STORE_MODULES).some(([name, pattern]) => name !== store && pattern.test(filename));
}
