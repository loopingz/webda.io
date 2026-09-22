// Emit a package through the two-pass tsgo build into a directory, without
// touching its `lib/`. One half of the stage 9 emit-parity check; compare the
// result against the TypeScript 6 build with `emit-classdiff.mjs`.
//
// Usage: node tools/emit-twopass.mjs <package-root> <out-dir> [storageModule]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { runTwoPass } from "../lib/twopass.js";
const root = process.argv[2], out = process.argv[3];
const r = runTwoPass({ configFile: join(root, "tsconfig.json"), rootDir: join(root, "src"), emit: true, storageModule: process.argv[4] });
console.log(`edits=${JSON.stringify(r.editCounts)} diagnostics=${r.diagnostics.length} emitted=${r.emitted.size} conflicts=${r.conflicts.length} ${Math.round(r.timing.totalMs)}ms`);
for (const d of r.diagnostics.slice(0, 8)) console.log("  DIAG", d.fileName ?? d.file?.fileName ?? "", JSON.stringify(d.messageText ?? d.message ?? d).slice(0, 180));
for (const [p, c] of r.emitted) { const t = join(out, relative(join(root, "lib"), p)); mkdirSync(dirname(t), { recursive: true }); writeFileSync(t, c); }
