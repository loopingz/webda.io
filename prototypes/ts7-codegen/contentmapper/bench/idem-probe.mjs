// Can a file already containing generated code be safely re-processed?
// This is the crux of whether codegen mode and mapper mode can coexist.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WarmSession } from "../../lib/mapper/session.js";

const here = dirname(fileURLToPath(import.meta.url));
const file = join(here, "src", "models", readdirSync(join(here, "src", "models")).sort()[0]);
const original = readFileSync(file, "utf8");

const s = new WarmSession({ configFile: join(here, "tsconfig.json"), cwd: here, storageModule: "../runtime.js" });
const a = s.transform(file, original);
console.log(`authored source   -> edits=${a.editCount}`);
const b = s.transform(file, a.text);
console.log(`generated source  -> edits=${b.editCount}  ${b.editCount === 0 ? "IDEMPOTENT" : "DOUBLE-APPLIES"}`);
if (b.editCount) console.log("  first re-edit:", JSON.stringify(b.text.slice(0, 260)));
const c = s.transform(file, b.text);
console.log(`third pass        -> edits=${c.editCount}  stable=${b.text === c.text}`);
s.dispose();
