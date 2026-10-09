// Run with `pnpm test` (node --test): the analytics wiring of the documentation site.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { cleanPageLocation } = require("../src/plugins/page-location");

test("the site's own analytics plugin is the only gtag loader configured", () => {
  const config = fs.readFileSync(path.join(__dirname, "..", "docusaurus.config.ts"), "utf8");
  assert.ok(config.includes('"./src/plugins/analytics"'), "the analytics plugin is configured");
  assert.ok(
    !config.includes("plugin-google-gtag"),
    "the stock gtag plugin must not be configured (it re-sends the full URL)"
  );
  assert.ok(!/gtag:\s*\{/.test(config), "the preset gtag option must not be used either");
});

test("page_location never carries a query string or a fragment", () => {
  assert.strictEqual(
    cleanPageLocation({ origin: "https://webda.io", pathname: "/debug/", search: "?port=18181", hash: "#token=x" }),
    "https://webda.io/debug/"
  );
  assert.strictEqual(
    cleanPageLocation({ origin: "https://webda.io", pathname: "/docs/Intro" }),
    "https://webda.io/docs/Intro"
  );
});

test("in-app page changes report the stripped location", () => {
  const client = require("../src/plugins/gtag-client");
  const calls = [];
  global.window = {
    gtag: (...args) => calls.push(args),
    location: {
      origin: "https://webda.io",
      pathname: "/docs/Debug/DebugDashboard",
      search: "?q=secret",
      hash: "#telemetry"
    }
  };
  const timers = [];
  global.setTimeout = fn => timers.push(fn);
  try {
    client.onRouteDidUpdate({
      location: { pathname: "/docs/Debug/DebugDashboard", search: "?q=secret", hash: "#telemetry" },
      previousLocation: { pathname: "/docs/Intro", search: "", hash: "" }
    });
    timers.forEach(fn => fn());
    assert.deepStrictEqual(calls, [
      [
        "event",
        "page_view",
        {
          page_location: "https://webda.io/docs/Debug/DebugDashboard",
          page_path: "/docs/Debug/DebugDashboard",
          page_referrer: ""
        }
      ]
    ]);
    // hash-only or same-path changes send nothing
    calls.length = 0;
    timers.length = 0;
    client.onRouteDidUpdate({
      location: { pathname: "/docs/Intro", search: "", hash: "#b" },
      previousLocation: { pathname: "/docs/Intro", search: "", hash: "#a" }
    });
    timers.forEach(fn => fn());
    assert.deepStrictEqual(calls, []);
  } finally {
    delete global.window;
    delete global.setTimeout;
  }
});

test("the head loader configures gtag with the stripped page_location and consent first", () => {
  const plugin = require("../src/plugins/analytics");
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const tags = plugin({}, { measurementId: "G-TEST12345" }).injectHtmlTags().headTags;
    const loaders = tags.filter(t => t.tagName === "script" && t.attributes && /gtag\/js/.test(t.attributes.src));
    assert.strictEqual(loaders.length, 1, "exactly one gtag loader");
    const inline = tags.find(t => t.tagName === "script" && t.innerHTML).innerHTML;
    assert.ok(
      inline.indexOf('gtag("consent", "default"') < inline.indexOf('gtag("config"'),
      "consent defaults precede config"
    );
    assert.ok(
      /page_location:\s*location\.origin \+ location\.pathname/.test(inline),
      "config carries the stripped page_location"
    );
    assert.deepStrictEqual(plugin({}, { measurementId: "" }).injectHtmlTags(), {}, "nothing without an id");
  } finally {
    process.env.NODE_ENV = previous;
  }
});
