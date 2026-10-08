/**
 * Copies the hosted debug dashboard built by @webda/debug-ui (dist/hosted) to
 * static/debug, so Docusaurus serves it as-is at /debug/ — outside the site's
 * React app, without its scripts or analytics tag.
 *
 * When GA_MEASUREMENT_ID is set, the id is written into the page's
 * `<meta name="webda-ga">`, which the dashboard uses for its sandboxed
 * analytics iframe. Without the variable the meta stays empty and no iframe
 * is ever created.
 */
const fs = require("fs");
const path = require("path");

const source = path.join(path.dirname(require.resolve("@webda/debug-ui/package.json")), "dist", "hosted");
const target = path.join(__dirname, "static", "debug");

if (!fs.existsSync(path.join(source, "index.html"))) {
  console.error(`Hosted dashboard not built (${source}): run \`pnpm run build\` in packages/debug-ui first`);
  process.exit(1);
}

fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(source, target, { recursive: true });

const id = (process.env.GA_MEASUREMENT_ID || "").trim();
const page = path.join(target, "index.html");
let html = fs.readFileSync(page, "utf8");
const placeholder = /<meta name="webda-ga" content=""\s*\/?>/;
if (!placeholder.test(html)) {
  console.error("Hosted dashboard page has no webda-ga meta placeholder");
  process.exit(1);
}
if (id) {
  if (!/^G-[A-Z0-9]+$/.test(id)) {
    console.error(`GA_MEASUREMENT_ID does not look like a GA4 measurement id: ${id}`);
    process.exit(1);
  }
  html = html.replace(placeholder, `<meta name="webda-ga" content="${id}" />`);
}
fs.writeFileSync(page, html);
console.log(`Hosted debug dashboard synced to static/debug (analytics ${id ? "on" : "off"})`);
