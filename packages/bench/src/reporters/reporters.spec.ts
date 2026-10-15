import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BENCH_SCHEMA_VERSION, resultKey, type BenchResult } from "../result.js";
import { main, parseArguments } from "../cli.js";
import { ConsoleReporter, toTextTable } from "./console.js";
import { compareResults, comparisonToMarkdown } from "./compare.js";
import { toGithubBenchmark } from "./github-benchmark.js";
import { defaultOutputDir, JsonReporter, loadResults } from "./json.js";
import { MarkdownReporter, toMarkdown } from "./markdown.js";
import { formatNumber } from "./reporter.js";

/**
 * Build a result
 *
 * @param overrides - values to change
 * @returns the result
 */
function result(overrides: Partial<BenchResult> = {}): BenchResult {
  return {
    schemaVersion: BENCH_SCHEMA_VERSION,
    suite: "store",
    backend: "MemoryStore",
    scenario: "store.get",
    params: { concurrency: 1, docSize: "small" },
    profile: "quick",
    mode: "closed",
    emulated: false,
    ops: 1000,
    errors: 0,
    durationMs: 10,
    throughput: 100000,
    latency: {
      count: 1000,
      min: 0.001,
      mean: 0.01,
      stddev: 0.002,
      p50: 0.01,
      p90: 0.02,
      p99: 0.05,
      p999: 0.1,
      max: 0.2
    },
    resources: {
      cpuUserMs: 1,
      cpuSystemMs: 0,
      rssDeltaBytes: 0,
      heapUsedDeltaBytes: 0,
      eventLoopDelay: { p50: 0, p99: 0, max: 0 }
    },
    checks: {},
    failures: [],
    unstable: false,
    notes: [],
    env: {
      node: "v24.0.0",
      platform: "linux",
      arch: "x64",
      cpu: "Test CPU",
      cpuCount: 4,
      totalMemoryBytes: 1,
      commit: "0123456789abcdef",
      ci: false
    },
    timestamp: "2026-10-14T00:00:00.000Z",
    ...overrides
  };
}

@suite
class ReportersTest {
  tmp: string;

  async beforeEach() {
    this.tmp = mkdtempSync(join(tmpdir(), "webda-bench-"));
  }

  async afterEach() {
    rmSync(this.tmp, { recursive: true, force: true });
  }

  @test
  key() {
    assert.strictEqual(resultKey(result()), "store/MemoryStore/store.get[concurrency=1,docSize=small]");
    assert.strictEqual(resultKey(result({ params: {} })), "store/MemoryStore/store.get");
    assert.strictEqual(formatNumber(1234.5678, 1), "1,234.6");
    assert.strictEqual(formatNumber(Infinity), "Infinity");
  }

  @test
  text() {
    const table = toTextTable([
      result(),
      result({ scenario: "store.patch", unstable: true, emulated: true, failures: ["lost"], notes: ["slow"] })
    ]);
    const lines = table.split("\n");
    assert.match(lines[0], /^suite\s+backend\s+scenario\s+params\s+ops\/s/);
    assert.match(lines[2], /store\.get\s+concurrency=1 docSize=small\s+100,000/);
    assert.match(lines[3], /unstable,emulated$/);
    assert.match(lines[4], /store\.patch .*: lost; slow/);
    const output: string[] = [];
    new ConsoleReporter(text => output.push(text)).report([]);
    assert.deepStrictEqual(output, []);
    new ConsoleReporter(text => output.push(text)).report([result()]);
    assert.strictEqual(output.length, 1);
  }

  @test
  markdown() {
    assert.strictEqual(toMarkdown([]), "_No benchmark results._");
    const markdown = toMarkdown(
      [result({ params: { query: "a|b" } }), result({ unstable: true, failures: ["x"] })],
      "T"
    );
    assert.ok(markdown.startsWith("## T\n"));
    assert.ok(markdown.includes("query=a\\|b"), "pipes are escaped");
    assert.ok(markdown.includes("commit 01234567"));
    assert.ok(markdown.includes("**Unstable results**"));
    const file = join(this.tmp, "summary.md");
    new MarkdownReporter(file, "Bench").report([result()]);
    new MarkdownReporter(file, "Bench").report([]);
    new MarkdownReporter(undefined).report([result()]);
    assert.strictEqual(
      readFileSync(file)
        .toString()
        .match(/## Bench/g).length,
      1
    );
  }

  @test
  json() {
    const output = join(this.tmp, "out");
    new JsonReporter(output).report([]);
    assert.ok(!existsSync(output));
    new JsonReporter(output).report([
      result(),
      result({ suite: "queue", backend: "SQS/Queue" }),
      result({ scenario: "x" })
    ]);
    assert.ok(existsSync(join(output, "store-MemoryStore.json")));
    assert.ok(existsSync(join(output, "queue-SQS_Queue.json")));
    writeFileSync(join(output, "other.json"), JSON.stringify({ schemaVersion: 999, results: [result()] }));
    writeFileSync(join(output, "broken.json"), "{");
    writeFileSync(join(output, "notes.txt"), "x");
    assert.strictEqual(loadResults([output, join(this.tmp, "missing")]).length, 3);
    assert.strictEqual(loadResults([join(output, "store-MemoryStore.json")]).length, 2);
    const previous = process.env.WEBDA_BENCH_OUTPUT;
    try {
      process.env.WEBDA_BENCH_OUTPUT = output;
      assert.strictEqual(defaultOutputDir(), output);
    } finally {
      if (previous === undefined) delete process.env.WEBDA_BENCH_OUTPUT;
      else process.env.WEBDA_BENCH_OUTPUT = previous;
    }
  }

  @test
  githubBenchmark() {
    const { biggerIsBetter, smallerIsBetter } = toGithubBenchmark([
      result({ emulated: true }),
      result({ scenario: "unstable", unstable: true }),
      result({ scenario: "empty", ops: 0 })
    ]);
    assert.deepStrictEqual(
      biggerIsBetter.map(e => [e.name, e.unit, e.value]),
      [["store/MemoryStore/store.get[concurrency=1,docSize=small] throughput", "ops/s", 100000]]
    );
    assert.deepStrictEqual(
      smallerIsBetter.map(e => [e.name, e.unit, e.value, e.range]),
      [["store/MemoryStore/store.get[concurrency=1,docSize=small] p99", "ms", 0.05, "± 0.002"]]
    );
    assert.ok(biggerIsBetter[0].extra.endsWith("emulated"));
  }

  @test
  compare() {
    const base = [
      result(),
      result({ scenario: "store.patch" }),
      result({ scenario: "store.slow" }),
      result({ scenario: "store.unstable", unstable: true }),
      result({ scenario: "store.zero", throughput: 0, latency: { ...result().latency, p99: 0 } })
    ];
    const current = [
      result({ throughput: 110000 }),
      result({ scenario: "store.patch", throughput: 50000 }),
      result({ scenario: "store.slow", latency: { ...result().latency, p99: 0.2 } }),
      result({ scenario: "store.unstable" }),
      result({ scenario: "store.zero" }),
      result({ scenario: "store.new" })
    ];
    const comparisons = compareResults(base, current, 1.5);
    assert.deepStrictEqual(
      comparisons.map(c => [c.current.scenario, c.regression]),
      [
        ["store.get", false],
        ["store.patch", true],
        ["store.slow", true],
        ["store.zero", false]
      ]
    );
    const markdown = comparisonToMarkdown(comparisons);
    assert.ok(markdown.includes("| +10% |"));
    assert.ok(markdown.includes("| -50% |"));
    assert.ok(markdown.includes("⚠️ regression"));
    assert.strictEqual(comparisonToMarkdown([]), "_No comparable benchmark results._");
  }

  @test
  cli() {
    assert.deepStrictEqual(parseArguments(["report", "a", "--markdown", "x.md", "--summary", "b", "--threshold=2"]), {
      command: "report",
      positionals: ["a", "b"],
      options: { markdown: "x.md", summary: true, threshold: "2" }
    });
    assert.strictEqual(parseArguments([]).command, "help");
    const logs: string[] = [];
    const log = (text: string) => logs.push(text);
    const base = join(this.tmp, "base");
    const current = join(this.tmp, "current");
    new JsonReporter(base).report([result()]);
    new JsonReporter(current).report([result({ throughput: 10 })]);

    assert.strictEqual(main(["report", join(this.tmp, "empty")], log), 0);
    assert.strictEqual(logs.pop(), "No benchmark results found");
    const prefix = join(this.tmp, "gh", "bench");
    const markdown = join(this.tmp, "report.md");
    assert.strictEqual(main(["report", base, "--markdown", markdown, "--github-benchmark", prefix], log), 0);
    assert.ok(readFileSync(markdown).toString().includes("store.get"));
    assert.strictEqual(JSON.parse(readFileSync(`${prefix}-bigger.json`).toString()).length, 1);
    assert.strictEqual(JSON.parse(readFileSync(`${prefix}-smaller.json`).toString()).length, 1);

    const summary = join(this.tmp, "summary.md");
    const previous = process.env.GITHUB_STEP_SUMMARY;
    try {
      process.env.GITHUB_STEP_SUMMARY = summary;
      assert.strictEqual(main(["compare", base, current, "--summary"], log), 0, "regressions only fail with --fail");
      assert.ok(readFileSync(summary).toString().includes("threshold ×1.5"));
    } finally {
      if (previous === undefined) delete process.env.GITHUB_STEP_SUMMARY;
      else process.env.GITHUB_STEP_SUMMARY = previous;
    }
    assert.match(logs.pop(), /^1 regression\(s\): store\/MemoryStore\/store.get/);
    assert.strictEqual(main(["compare", base, current, "--fail"], log), 1);
    assert.strictEqual(main(["compare", base, base, "--fail", "--threshold", "1.1"], log), 0);
    assert.strictEqual(main(["compare", base, current, "--threshold", "0.5"], log), 2);
    assert.strictEqual(main(["compare", base], log), 2);
    assert.strictEqual(main(["help"], log), 0);
    assert.strictEqual(main(["unknown"], log), 2);
  }
}
