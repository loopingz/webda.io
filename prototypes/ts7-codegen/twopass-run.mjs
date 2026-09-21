import { runTwoPass } from "./lib/twopass.js";
const root = process.cwd() + "/fixture2";
const r = runTwoPass({
  configFile: `${root}/tsconfig.json`,
  rootDir: `${root}/src`,
  storageModule: "./runtime.js",
  emit: true
});
console.log("edits by generator:", JSON.stringify(r.editCounts));
console.log("conflicts:", r.conflicts.length);
console.log(`timing: pass1 ${r.timing.pass1Ms.toFixed(0)}ms  pass2 ${r.timing.pass2Ms.toFixed(0)}ms  total ${r.timing.totalMs.toFixed(0)}ms`);
console.log("diagnostics against GENERATED code:", r.diagnostics.length);
for (const d of r.diagnostics.slice(0,8)) console.log("   TS" + d.code + ":", JSON.stringify(d).slice(0,160));
console.log("\n===== INJECTED app.ts =====");
console.log(r.injected.get(`${root}/src/app.ts`) ?? "(not injected)");
