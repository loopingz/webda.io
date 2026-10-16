import { suite, test } from "@webda/test";
import { BenchmarkRunner, SeededRandom } from "@webda/bench";
import { BlogBench } from "./blog.js";
import { BLOG_DATASETS, seedBlog, type BlogDataset } from "./seed.js";
import { BLOG_OPERATIONS, pickOperation } from "./workload.js";

/**
 * Blog requests through the Router: each operation alone, then the weighted mix, then the login (bcrypt)
 */
@suite
class BlogDomainBench extends BlogBench {
  /**
   * Seeded data
   */
  data: BlogDataset;
  /**
   * Runner of the suite
   */
  runner: BenchmarkRunner;

  /**
   * Build the application then seed the blog
   */
  async beforeAll() {
    await super.beforeAll();
    this.runner = new BenchmarkRunner({ suite: "blog", backend: this.backend });
    const size = BLOG_DATASETS[this.runner.profile.name] ?? BLOG_DATASETS.quick;
    await this.resetStore();
    this.data = await seedBlog(size);
  }

  /**
   * Parameters of the results
   *
   * @param concurrency - workers
   * @returns the parameters
   */
  params(concurrency: number) {
    return { concurrency, audit: this.audit, posts: this.data.size.posts, users: this.data.size.users };
  }

  /**
   * Each operation alone
   */
  @test
  async operations() {
    const rng = new SeededRandom(7);
    for (const concurrency of this.runner.profile.concurrency) {
      for (const op of BLOG_OPERATIONS) {
        await this.runner.closedLoop({
          name: `blog.domain.${op.name}`,
          params: this.params(concurrency),
          concurrency,
          ops: Math.max(10, Math.floor(this.runner.profile.ops / 5)),
          op: index => op.run(this, this.data, rng, index)
        });
      }
    }
  }

  /**
   * The weighted mix of a blog: 35% feed, 30% post pages, 10% tag pages, 5% profiles, 10% comments, 5% drafts,
   * 3% publications, 2% follows
   */
  @test
  async mix() {
    const rng = new SeededRandom(11);
    for (const concurrency of this.runner.profile.concurrency) {
      await this.runner.closedLoop({
        name: "blog.domain.mix",
        params: this.params(concurrency),
        concurrency,
        op: index => pickOperation(rng).run(this, this.data, rng, index)
      });
    }
  }

  /**
   * Login: dominated by the bcrypt comparison (cost 10)
   */
  @test
  async login() {
    const email = `bench-login-${process.pid}@example.com`;
    const password = "bench-password-1";
    await this.expectOk("PUT", "/users/register", {
      username: `bench_login_${process.pid}`,
      email,
      name: "Login",
      password
    });
    for (const concurrency of this.runner.profile.concurrency) {
      await this.runner.closedLoop({
        name: "blog.login",
        params: { concurrency },
        concurrency,
        ops: Math.max(5, Math.floor(this.runner.profile.ops / 50)),
        warmupOps: 1,
        op: async () => {
          const res = await this.request("PUT", "/users/login", { email, password });
          if (res.status >= 400 || res.body !== true) {
            throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
          }
        }
      });
    }
  }

  /**
   * Report the results
   */
  async afterAll() {
    await this.runner?.finish();
    await super.afterAll();
  }
}

/**
 * The mix without the AuditService: the difference is the cost of the audit log
 */
@suite
class BlogDomainNoAuditBench extends BlogDomainBench {
  audit = false;

  /**
   * Only the mix is compared
   */
  async operations() {
    // Skipped: see BlogDomainBench
  }

  /**
   * Only the mix is compared
   */
  async login() {
    // Skipped: see BlogDomainBench
  }
}
