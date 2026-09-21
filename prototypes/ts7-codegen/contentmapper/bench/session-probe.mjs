// Direct probe of WarmSession: does the resident program see edited buffer text?
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WarmSession } from "../../lib/mapper/session.js";

const here = dirname(fileURLToPath(import.meta.url));
const configFile = join(here, "tsconfig.json");
const pick = process.env.PROBE_FILE ?? readdirSync(join(here, "src", "models")).sort()[0];
const file = join(here, "src", "models", pick);
const original = readFileSync(file, "utf8");

const session = new WarmSession({ configFile, cwd: here, storageModule: "../runtime.js" });
console.log(`startup ${session.startupMs.toFixed(0)}ms, files=${session.fileCount}`);

const a = session.transform(file, original);
console.log(`pass 1 (original)      edits=${a.editCount} spans=${a.mappings.length} ${a.timing.totalMs.toFixed(1)}ms`);

const edited = original.replace('  label: string = "";', '  label: string = "";\n  deletedAt: Date;');
const b = session.transform(file, edited);
console.log(`pass 2 (+deletedAt)    edits=${b.editCount} spans=${b.mappings.length} ${b.timing.totalMs.toFixed(1)}ms`);
console.log(`  contains deletedAt accessor: ${/get deletedAt/.test(b.text)}`);

const c = session.transform(file, edited);
console.log(`pass 3 (unchanged)     edits=${c.editCount} ${c.timing.totalMs.toFixed(1)}ms changed=${c.timing.changed}`);

session.dispose();
