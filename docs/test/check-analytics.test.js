// Run with `pnpm test` (node --test): the post-build analytics check (check-analytics.js).
const { test } = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ID = "G-ABC123";
const LOADER = "https://www.googletagmanager.com/gtag/js";

/**
 * Write a minimal built site and run the check on it.
 *
 * @param {object} options - measurement id and relay content
 * @returns {{ status: number, output: string }} the check's exit code and output
 */
function runCheck({ id = "", relay }) {
  const build = fs.mkdtempSync(path.join(os.tmpdir(), "check-analytics-"));
  fs.mkdirSync(path.join(build, "debug"));
  const head = id
    ? `<script async src="${LOADER}?id=${id}"></script><script>gtag("config","${id}",{page_location:location.origin})</script>`
    : "";
  fs.writeFileSync(path.join(build, "index.html"), `<html><head>${head}</head></html>`);
  fs.writeFileSync(path.join(build, "debug", "index.html"), "<html><body><div id=app></div></body></html>");
  fs.writeFileSync(path.join(build, "debug", "analytics.html"), relay);
  const result = spawnSync(process.execPath, [path.join(__dirname, "..", "check-analytics.js"), build], {
    env: { ...process.env, GA_MEASUREMENT_ID: id },
    encoding: "utf8"
  });
  fs.rmSync(build, { recursive: true, force: true });
  return { status: result.status, output: result.stdout + result.stderr };
}

/**
 * The relay as the debug-ui build emits it: the loader is always inlined, the
 * id is baked in by sync-debug-ui.js (empty without GA_MEASUREMENT_ID).
 *
 * @param {string} bakedId - JSON literal of the id in the relay
 * @returns {string} the relay page
 */
function relay(bakedId) {
  return `<html><script>const id = ${bakedId}; if (/^G-[A-Z0-9]+$/.test(id)) { s.src = "${LOADER}?id=" + id; }</script></html>`;
}

test("passes without GA_MEASUREMENT_ID: the relay's inlined loader never runs", () => {
  const { status, output } = runCheck({ relay: relay('""') });
  assert.strictEqual(status, 0, output);
});

test("passes with GA_MEASUREMENT_ID baked into the relay", () => {
  const { status, output } = runCheck({ id: ID, relay: relay(JSON.stringify(ID)) });
  assert.strictEqual(status, 0, output);
});

test("fails when the relay still carries the id placeholder", () => {
  const { status, output } = runCheck({ relay: relay('"__WEBDA_GA_ID__"') });
  assert.strictEqual(status, 1);
  assert.match(output, /placeholder/);
});

test("fails when the relay loads gtag through a script tag", () => {
  const { status, output } = runCheck({ relay: `<html><script async src="${LOADER}?id=x"></script></html>` });
  assert.strictEqual(status, 1);
  assert.match(output, /relay must inline exactly one gtag loader/);
});
