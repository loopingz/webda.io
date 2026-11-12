#!/usr/bin/env node
// Measure where unit test time goes, package by package.
//
//   node scripts/test-timings.mjs [--out <dir>] [--only pkg1,pkg2] [--no-coverage] [--compare <summary.json>]
//
// Each package with a `vitest run` test script is run serially (so packages do not
// compete for CPU) with the JSON reporter added. Results land in <dir>:
//   <package>.json   raw vitest JSON report
//   <package>.log    vitest output
//   summary.json     wall time per package, slowest files and slowest tests
// Use --compare with a previous summary.json to print the delta per package.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const args = process.argv.slice(2);
/**
 * Read the value following a command line flag
 * @param name - flag name
 * @returns the value or undefined
 */
function option(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
const root = resolve(import.meta.dirname, "..");
const out = resolve(option("--out") ?? join(root, "reports", "test-timings"));
const only = option("--only")?.split(",");
const noCoverage = args.includes("--no-coverage");
const compare = option("--compare");
mkdirSync(out, { recursive: true });

const packages = [];
for (const group of ["packages", "sample-apps"]) {
  for (const directory of readdirSync(join(root, group))) {
    const path = join(root, group, directory);
    if (!existsSync(join(path, "package.json"))) continue;
    const info = JSON.parse(readFileSync(join(path, "package.json"), "utf8"));
    if (info.scripts?.test !== "vitest run") continue;
    if (only && !only.includes(directory)) continue;
    packages.push({ name: directory, path });
  }
}

const summary = { date: new Date().toISOString(), node: process.version, coverage: !noCoverage, packages: {} };
const files = [];
const tests = [];
for (const pkg of packages) {
  const report = join(out, `${pkg.name}.json`);
  const vitestArgs = ["exec", "vitest", "run", "--reporter=default", "--reporter=json", `--outputFile.json=${report}`];
  if (noCoverage) vitestArgs.push("--coverage.enabled=false");
  const start = performance.now();
  const result = spawnSync("pnpm", vitestArgs, { cwd: pkg.path, encoding: "utf8", maxBuffer: 1 << 30 });
  const wall = Math.round(performance.now() - start);
  const output = (result.stdout ?? "") + (result.stderr ?? "");
  writeFileSync(join(out, `${pkg.name}.log`), output);
  const entry = { wall, exit: result.status, files: 0, tests: 0, failed: 0, testTime: 0 };
  // Vitest breakdown line: "Duration  5.2s (transform 1s, setup 0ms, import 2s, tests 3s, environment 0ms)"
  const duration = output.replace(/\x1b\[[0-9;]*m/g, "").match(/Duration\s+(.*)/);
  if (duration) entry.breakdown = duration[1].trim();
  if (existsSync(report) && result.status !== null) {
    try {
      const json = JSON.parse(readFileSync(report, "utf8"));
      entry.files = json.testResults.length;
      entry.tests = json.numTotalTests;
      entry.failed = json.numFailedTests;
      for (const file of json.testResults) {
        const name = relative(root, file.name);
        const time = Math.round(file.endTime - file.startTime);
        entry.testTime += time;
        files.push({ file: name, time, tests: file.assertionResults.length });
        for (const test of file.assertionResults) {
          tests.push({ file: name, test: test.fullName, time: Math.round(test.duration ?? 0) });
        }
      }
    } catch (err) {
      entry.error = String(err);
    }
  }
  summary.packages[pkg.name] = entry;
  console.log(
    `${pkg.name.padEnd(16)} ${(wall / 1000).toFixed(1).padStart(7)}s  exit=${entry.exit} files=${entry.files} tests=${entry.tests} failed=${entry.failed}  ${entry.breakdown ?? ""}`
  );
}
summary.total = Object.values(summary.packages).reduce((sum, entry) => sum + entry.wall, 0);
summary.slowestFiles = files.sort((a, b) => b.time - a.time).slice(0, 40);
summary.slowestTests = tests.sort((a, b) => b.time - a.time).slice(0, 60);
writeFileSync(join(out, "summary.json"), JSON.stringify(summary, undefined, 2));

console.log(`\nTotal wall: ${(summary.total / 1000).toFixed(1)}s`);
console.log("\nSlowest files:");
for (const file of summary.slowestFiles.slice(0, 20)) {
  console.log(`  ${(file.time / 1000).toFixed(1).padStart(7)}s  ${file.file} (${file.tests} tests)`);
}
console.log("\nSlowest tests:");
for (const test of summary.slowestTests.slice(0, 25)) {
  console.log(`  ${(test.time / 1000).toFixed(1).padStart(7)}s  ${test.file} > ${test.test}`);
}

if (compare) {
  const previous = JSON.parse(readFileSync(compare, "utf8"));
  console.log(`\nDelta against ${compare}:`);
  for (const [name, entry] of Object.entries(summary.packages)) {
    const before = previous.packages[name]?.wall;
    if (before === undefined) continue;
    const delta = entry.wall - before;
    console.log(
      `  ${name.padEnd(16)} ${(before / 1000).toFixed(1).padStart(7)}s -> ${(entry.wall / 1000).toFixed(1).padStart(7)}s  ${delta > 0 ? "+" : ""}${((delta / before) * 100).toFixed(0)}%`
    );
  }
  console.log(
    `  ${"TOTAL".padEnd(16)} ${(previous.total / 1000).toFixed(1).padStart(7)}s -> ${(summary.total / 1000).toFixed(1).padStart(7)}s`
  );
}
