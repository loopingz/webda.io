// Guards `pnpm pack` / `pnpm publish`: the bundled dashboard must be part of the package.
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const webui = join(dirname(fileURLToPath(import.meta.url)), "..", "webui");
const missing = [];
if (!existsSync(join(webui, "index.html"))) missing.push("webui/index.html");
const assets = existsSync(join(webui, "assets")) ? readdirSync(join(webui, "assets")) : [];
if (!assets.some(f => f.endsWith(".js"))) missing.push("webui/assets/*.js");
if (!assets.some(f => f.endsWith(".css"))) missing.push("webui/assets/*.css");
if (missing.length) {
  console.error(`@webda/debug: the dashboard bundle is missing (${missing.join(", ")}); run \`pnpm run build\` first`);
  process.exit(1);
}
