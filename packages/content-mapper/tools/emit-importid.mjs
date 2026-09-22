// Import-identity check for stage 9 emit parity. For every file, each value
// binding the TypeScript 6 emit imports must also be imported by the tsgo
// emit and resolve to the identical runtime object — which proves a rebound
// specifier (a monorepo-relative path replaced by the package name) is safe.
//
// Usage, from the package root: node emit-importid.mjs <tsc6-lib> <tsgo-lib>
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
const [libA, libB] = process.argv.slice(2);
const walk = d => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith(".js") ? [p] : []; });
const valueImports = text => {
  const out = new Map();
  for (const m of text.matchAll(/^import\s+(?!type\b)\{([^}]*)\}\s+from\s+["']([^"']+)["'];?$/gm))
    for (const part of m[1].split(",").map(s => s.trim()).filter(Boolean)) {
      if (part.startsWith("type ")) continue;
      const [imported, local] = part.split(/\s+as\s+/);
      out.set(local ?? imported, { imported, spec: m[2] });
    }
  return out;
};
let checked = 0, problems = 0;
for (const fa of walk(libA)) {
  const rel = relative(libA, fa); const fb = join(libB, rel);
  if (!existsSync(fb)) continue;
  const a = valueImports(readFileSync(fa, "utf8")), b = valueImports(readFileSync(fb, "utf8"));
  for (const [local, ia] of a) {
    const ib = b.get(local);
    const text = readFileSync(fb, "utf8");
    // A binding the tsgo output never references needs no import.
    if (!ib) { if (new RegExp(`\\b${local}\\b`).test(text.replace(/^import.*$/gm, ""))) { console.log(`MISSING  ${rel}: ${local}`); problems++; } continue; }
    if (ia.spec === ib.spec && ia.imported === ib.imported) continue;
    const base = pathToFileURL(fa).href;
    const load = async (spec, name) => (await import(spec.startsWith(".") ? new URL(spec, base).href : import.meta.resolve(spec, base)))[name];
    try {
      const [va, vb] = [await load(ia.spec, ia.imported), await load(ib.spec, ib.imported)];
      checked++;
      if (va !== vb || va === undefined) { console.log(`DIFFERENT  ${rel}: ${local}  ${ia.spec} vs ${ib.spec}`); problems++; }
    } catch (e) { console.log(`LOAD-FAIL  ${rel}: ${local} ${e.message.slice(0, 100)}`); problems++; }
  }
}
console.log(`identity-checked ${checked} rebound imports, problems=${problems}`);
process.exitCode = problems ? 1 : 0;
