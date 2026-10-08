// Builds the analytics relay as one classic script and inlines it into dist/hosted/analytics.html.
// The relay runs in a sandboxed iframe with an opaque origin, which cannot fetch module scripts
// cross-origin, so the page must carry its script inline.
import { build } from "vite";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "dist", "analytics-build");

await build({
  root,
  configFile: false,
  logLevel: "warn",
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    outDir: out,
    emptyOutDir: true,
    sourcemap: false,
    minify: true,
    lib: {
      entry: join(root, "hosted", "analytics.ts"),
      name: "WebdaDebugAnalytics",
      formats: ["iife"],
      fileName: () => "analytics.js"
    }
  }
});

const script = readFileSync(join(out, "analytics.js"), "utf8");
if (script.includes("</script")) throw new Error("the relay script must not contain </script");
const template = readFileSync(join(root, "hosted", "analytics.html"), "utf8");
if (!template.includes("/* WEBDA_ANALYTICS_RELAY */")) throw new Error("analytics.html template has no placeholder");
mkdirSync(join(root, "dist", "hosted"), { recursive: true });
writeFileSync(
  join(root, "dist", "hosted", "analytics.html"),
  template.replace("/* WEBDA_ANALYTICS_RELAY */", script.trim())
);
rmSync(out, { recursive: true, force: true });
console.log("dist/hosted/analytics.html written with the inlined relay");
