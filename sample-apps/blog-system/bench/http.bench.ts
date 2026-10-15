import { suite, test } from "@webda/test";
import { useService } from "@webda/core";
import { BenchmarkRunner, SeededRandom } from "@webda/bench";
import { BlogBench } from "./blog.js";
import { BLOG_DATASETS, seedBlog, type BlogDataset } from "./seed.js";

/**
 * Query of the feed, the same for both transports
 */
const FEED = "status = 'published' ORDER BY publishedAt DESC LIMIT 20";

/**
 * The same reads over REST and GraphQL, through a real HTTP server on localhost (keep-alive connections): the
 * difference with `blog.domain.*` is the cost of HTTP, and between the transports the cost of each protocol
 */
@suite
class BlogHttpBench extends BlogBench {
  /**
   * Seeded data
   */
  data: BlogDataset;
  /**
   * Base URL of the server
   */
  baseUrl: string;

  /**
   * Keep an HTTP server, on a free port, without TLS
   *
   * @param app - the application
   */
  async tweakApp(app: any) {
    await super.tweakApp(app);
    app.getCurrentConfiguration().services.HttpServer = { type: "Webda/HttpServer", port: 0 };
  }

  /**
   * Build the application, seed the blog and start listening
   */
  async beforeAll() {
    await super.beforeAll();
    const profile = new BenchmarkRunner({ suite: "blog", backend: this.backend, reporters: [] }).profile;
    this.data = await seedBlog(BLOG_DATASETS[profile.name] ?? BLOG_DATASETS.quick);
    const server: any = useService("HttpServer" as any);
    await server.start("127.0.0.1", 0);
    this.baseUrl = `http://127.0.0.1:${server.address().port}`;
  }

  /**
   * Call the server
   *
   * @param method - HTTP method
   * @param path - path
   * @param body - JSON body
   * @returns the parsed body
   */
  async call(method: string, path: string, body?: any): Promise<any> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: body ? { "content-type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    if (res.status >= 400) {
      throw new Error(`${method} ${path} → ${res.status} ${text.substring(0, 200)}`);
    }
    const json = text ? JSON.parse(text) : undefined;
    if (json?.errors?.length) {
      throw new Error(`GraphQL error: ${JSON.stringify(json.errors).substring(0, 200)}`);
    }
    return json;
  }

  /**
   * Get a post and the feed, over REST and GraphQL
   */
  @test
  async transports() {
    const runner = new BenchmarkRunner({ suite: "blog", backend: this.backend });
    const rng = new SeededRandom(13);
    const slug = () => this.data.published[rng.int(this.data.published.length)];
    const reads: [string, () => Promise<any>][] = [
      ["blog.http.rest.getPost", () => this.call("GET", `/posts/${slug()}`)],
      [
        "blog.http.graphql.getPost",
        () =>
          this.call("POST", "/graphql", {
            query: `{ Post(slug: "${slug()}") { slug title content status viewCount } }`
          })
      ],
      ["blog.http.rest.feed", () => this.call("PUT", "/posts", { q: FEED })],
      [
        "blog.http.graphql.feed",
        () =>
          this.call("POST", "/graphql", {
            query: `{ Posts(query: ${JSON.stringify(FEED)}) { results { slug title content status viewCount } } }`
          })
      ]
    ];
    try {
      for (const concurrency of runner.profile.concurrency) {
        for (const [name, read] of reads) {
          await runner.closedLoop({
            name,
            params: { concurrency, posts: this.data.size.posts },
            concurrency,
            ops: Math.max(10, Math.floor(runner.profile.ops / 5)),
            op: async () => {
              await read();
            }
          });
        }
      }
    } finally {
      await runner.finish();
      await (useService("HttpServer" as any) as any).stop();
    }
  }
}
