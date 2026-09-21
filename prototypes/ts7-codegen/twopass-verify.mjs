import { runTwoPass } from "./lib/twopass.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
const root = process.cwd() + "/fixture2";
const r = runTwoPass({ configFile:`${root}/tsconfig.json`, rootDir:`${root}/src`, storageModule:"./runtime.js", emit:true });
console.log("diagnostics:", r.diagnostics.length, "| emitted files:", r.emitted.size);
// materialise emit so we can actually run it
for (const [p,c] of r.emitted) { mkdirSync(dirname(p),{recursive:true}); writeFileSync(p,c); }
const dts = r.emitted.get(`${root}/lib/app.d.ts`);
console.log("\n===== EMITTED lib/app.d.ts (by plain tsgo, no transformer) =====");
console.log(dts);
