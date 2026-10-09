/**
 * Post-build assertion: every built page has at most one gtag loader (exactly
 * one when GA_MEASUREMENT_ID is set, none otherwise), every `gtag("config"`
 * call carries the stripped `page_location`, and the hosted dashboard page
 * (/debug/) loads no gtag at all; its sandboxed relay (/debug/analytics.html)
 * carries exactly one inlined loader with the baked-in id.
 */
const fs = require("fs");
const path = require("path");

const build = path.join(__dirname, "build");
const id = (process.env.GA_MEASUREMENT_ID || "").trim();
const problems = [];
let pages = 0;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith(".html")) check(full);
  }
}

function check(file) {
  const html = fs.readFileSync(file, "utf8");
  const rel = path.relative(build, file);
  pages++;
  const loaders = (html.match(/googletagmanager\.com\/gtag\/js/g) || []).length;
  if (rel === path.join("debug", "index.html")) {
    if (loaders > 0 || /gtag\(/.test(html)) problems.push(`${rel}: the dashboard page must not load gtag`);
    return;
  }
  if (rel === path.join("debug", "analytics.html")) {
    // The sandboxed relay is the only place gtag runs for the dashboard: one inlined loader, no script tag with a src
    if (loaders !== (id ? 1 : 0) || /<script[^>]*\ssrc=/.test(html))
      problems.push(`${rel}: the relay must inline exactly one gtag loader`);
    if (id && !html.includes(JSON.stringify(id))) problems.push(`${rel}: the measurement id is not baked in`);
    return;
  }
  if (loaders !== (id ? 1 : 0)) problems.push(`${rel}: ${loaders} gtag loader(s), expected ${id ? 1 : 0}`);
  const configs = html.match(/gtag\("config",[^)]*\)/g) || [];
  for (const call of configs) {
    if (!call.includes("page_location")) problems.push(`${rel}: config without page_location: ${call.slice(0, 80)}`);
  }
  if (!id && configs.length) problems.push(`${rel}: gtag config present without GA_MEASUREMENT_ID`);
}

walk(build);
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(
  `check-analytics: ${pages} pages, analytics ${id ? "on (one loader per page, page_location stripped)" : "off (no loader)"}`
);
