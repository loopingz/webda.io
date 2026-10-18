import { suite, test } from "@webda/test";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
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
  ["blog.coldboot.firstRequest", "coreInitialized", "firstRequest"],
  ["blog.coldboot.warmRequest", "firstRequest", "secondRequest"]
];

/**
 * Run the cold boot child once
 *
 * @returns the sample
 */
function coldBoot(): Promise<ColdBootSample> {
  // No vitest loader nor option in the child: a plain Node process, like production
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => key !== "NODE_OPTIONS" && !key.startsWith("VITEST"))
  );
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
    const samples: ColdBootSample[] = [];
    for (let i = 0; i < boots; i++) {
      samples.push(await coldBoot());
    }
    const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
    for (const [name, from, to] of PHASES) {
      await runner.custom({
        name,
        params: { boots },
        run: async latency => {
          let total = 0;
          for (const sample of samples) {
            const ms = sample.phases[to] - sample.phases[from];
            latency.recordMs(ms);
            total += ms;
          }
          return {
            ops: samples.length,
            durationMs: total,
            checks:
              name === "blog.coldboot.total"
                ? {
                    services: samples[0].services,
                    rssMB: Math.round(median(samples.map(s => s.rssBytes)) / 1048576),
                    spawnToExitMs: Math.round(median(samples.map(s => s.wallMs)))
                  }
                : {}
          };
        }
      });
    }
    await runner.finish();
  }
}
