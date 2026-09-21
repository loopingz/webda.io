import { runTwoPass } from "./lib/twopass.js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
// prototypes/ts7-codegen -> repository root
const REPO = process.env.WEBDA_REPO ?? resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
for (const pkg of ["models","core","runtime"]) {
  const root=`${REPO}/packages/${pkg}`;
  try {
    const t0=process.hrtime.bigint();
    const r=runTwoPass({ configFile:`${root}/tsconfig.json`, rootDir:`${root}/src`, storageModule:"@webda/models" });
    const total=Number(process.hrtime.bigint()-t0)/1e6;
    console.log(`${pkg.padEnd(9)} pass1 ${r.timing.pass1Ms.toFixed(0).padStart(5)}ms  pass2 ${r.timing.pass2Ms.toFixed(0).padStart(5)}ms  total ${total.toFixed(0).padStart(5)}ms`);
    console.log(`          edits: ${JSON.stringify(r.editCounts)}  files touched: ${r.injected.size}  conflicts: ${r.conflicts.length}  diagnostics: ${r.diagnostics.length}`);
    for (const d of r.diagnostics.slice(0,3)) console.log(`            TS${d.code} ${String(d.fileName||"").split("/src/")[1]||""}`);
  } catch(e){ console.log(`${pkg}: ERROR ${e.message.slice(0,120)}`); }
}
