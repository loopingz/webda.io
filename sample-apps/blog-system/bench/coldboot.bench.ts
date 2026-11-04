import { suite, test } from "@webda/test";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { BenchmarkRunner, now } from "@webda/bench";
import { appDir } from "./blog.js";
import { blogStore } from "./stores.mjs";

/**
 * Times reported by the child process, in ms since it started
 */
interface ColdBootSample {
  /**
   * Phase end times
   */
  phases: Record<string, number>;
  /**
   * Services initialized
   */
  services: number;
  /**
   * Duration of each Service.init(), in ms
   */
  serviceInit: Record<string, number>;
  /**
   * Resident memory after the first requests
   */
  rssBytes: number;
  /**
   * Time from spawn to exit, measured by the parent
   */
  wallMs: number;
}

/**
 * Phases of a cold boot: name, start mark and end mark of the child timings
 */
const PHASES: [string, string, string][] = [
  // Process start to the first response: what a serverless cold start adds to the first invocation
  ["blog.coldboot.total", "processStart", "firstRequest"],
  ["blog.coldboot.nodeStart", "processStart", "scriptStart"],
  ["blog.coldboot.import", "scriptStart", "frameworkImported"],
  ["blog.coldboot.load", "frameworkImported", "applicationLoaded"],
  ["blog.coldboot.init", "applicationLoaded", "coreInitialized"],
  // init split: create and resolve the services, then their init()
  ["blog.coldboot.resolve", "applicationLoaded", "coreResolved"],
  ["blog.coldboot.servicesInit", "coreResolved", "coreInitialized"],
  ["blog.coldboot.firstRequest", "coreInitialized", "firstRequest"],
  ["blog.coldboot.warmRequest", "firstRequest", "secondRequest"]
];

/**
 * Services reported with their init time in the checks of blog.coldboot.servicesInit
 */
const SLOWEST_SERVICES = 5;

/**
 * Run the cold boot child once
 *
 * @param compileCache - folder of the Node compile cache, as enabled by the `webda` launcher
 * @returns the sample
 */
function coldBoot(compileCache?: string): Promise<ColdBootSample> {
  // No vitest loader nor option in the child: a plain Node process, like production
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => key !== "NODE_OPTIONS" && key !== "NODE_COMPILE_CACHE" && !key.startsWith("VITEST")
    )
  );
  if (compileCache) {
    env.NODE_COMPILE_CACHE = compileCache;
  }
  const start = now();
  return new Promise((done, reject) => {
    const child = spawn(process.execPath, [resolve(appDir, "bench/coldboot-child.mjs")], { cwd: appDir, env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => (stdout += chunk));
    child.stderr.on("data", chunk => (stderr += chunk));
    child.on("error", reject);
    child.on("exit", code => {
      const wallMs = Number(now() - start) / 1e6;
      const line = stdout
        .trim()
        .split("\n")
        .reverse()
        .find(l => l.startsWith("{"));
      if (code !== 0 || !line) {
        reject(new Error(`cold boot exited with ${code}: ${stderr.substring(0, 500)}`));
        return;
      }
      done({ ...JSON.parse(line), wallMs });
    });
  });
}

/**
 * Cold boot of the blog-system application in new processes: the startup cost of a serverless function or a new
 * container, phase by phase (see coldboot-child.mjs)
 */
@suite
class BlogColdBootBench {
  /**
   * Boot the application in fresh processes
   */
  @test
  async coldBoot() {
    const store = blogStore();
    const runner = new BenchmarkRunner({ suite: "blog", backend: store.backend });
    const boots = { smoke: 2, quick: 5, full: 15 }[runner.profile.name] ?? 5;
    // Without compile cache (`node .../cli.js`, e.g. the default container entrypoint), then with the cache the
    // `webda` launcher enables (#365): warmed by a first boot, like any start after the first one
    const cache = mkdtempSync(join(tmpdir(), "webda-compile-cache-"));
    try {
      const samples: ColdBootSample[] = [];
      const cached: ColdBootSample[] = [];
      await coldBoot(cache);
      for (let i = 0; i < boots; i++) {
        // Interleaved: both variants see the same machine load
        samples.push(await coldBoot());
        cached.push(await coldBoot(cache));
      }
      await this.report(runner, samples, { boots });
      await this.report(runner, cached, { boots, compileCache: true });
    } finally {
      rmSync(cache, { recursive: true, force: true });
    }
    await runner.finish();
  }

  /**
   * Report the phases of the samples
   *
   * @param runner - the runner
   * @param samples - the boots
   * @param params - parameters of the results
   */
  async report(runner: BenchmarkRunner, samples: ColdBootSample[], params: Record<string, number | boolean>) {
    const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
    const serviceInit = Object.keys(samples[0].serviceInit)
      .map(service => [service, median(samples.map(s => s.serviceInit[service] ?? 0))] as const)
      .sort((a, b) => b[1] - a[1])
      .slice(0, SLOWEST_SERVICES);
    for (const [name, from, to] of PHASES) {
      await runner.custom({
        name,
        params,
        run: async latency => {
          let total = 0;
          for (const sample of samples) {
            const ms = sample.phases[to] - sample.phases[from];
            latency.recordMs(ms);
            total += ms;
          }
          let checks: Record<string, number> = {};
          if (name === "blog.coldboot.total") {
            checks = {
              services: samples[0].services,
              rssMB: Math.round(median(samples.map(s => s.rssBytes)) / 1048576),
              spawnToExitMs: Math.round(median(samples.map(s => s.wallMs)))
            };
          } else if (name === "blog.coldboot.servicesInit") {
            // Median init time of the slowest services, in ms
            checks = Object.fromEntries(serviceInit.map(([service, ms]) => [`${service}Ms`, Math.round(ms * 10) / 10]));
          }
          return { ops: samples.length, durationMs: total, checks };
        }
      });
    }
  }
}
