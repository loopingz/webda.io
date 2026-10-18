import { suite, test } from "@webda/test";
import { useCore } from "@webda/core";
import { BenchmarkRunner, now } from "@webda/bench";
import { BlogBench } from "./blog.js";

/**
 * Boot time of the blog-system application: load the application (modules, models, schemas), create the Core and
 * initialize every service
 *
 * The boots run in the same process, after the first one done by the test harness: the module imports are cached,
 * so this is a warm boot. A cold boot needs a new process (see the boot cache, #365).
 */
@suite
class BlogBootBench extends BlogBench {
  /**
   * Boot the application several times
   */
  @test
  async boot() {
    const runner = new BenchmarkRunner({ suite: "blog", backend: this.backend });
    const boots = Math.max(3, runner.profile.scanOps * 2);
    await runner.custom({
      name: "blog.boot",
      params: { audit: this.audit, mode: "warm" },
      run: async latency => {
        let measuredNs = 0n;
        let rss = 0;
        for (let i = 0; i < boots; i++) {
          await useCore()?.stop();
          const start = now();
          // The harness boot: new application, new Core, Core.init()
          await this.beforeAll();
          measuredNs += latency.recordSince(start);
          rss = Math.max(rss, process.memoryUsage().rss);
        }
        return {
          ops: boots,
          durationMs: Number(measuredNs) / 1e6,
          checks: { services: Object.keys(useCore().getServices()).length, rssMB: Math.round(rss / 1048576) }
        };
      }
    });
    await runner.finish();
  }
}
