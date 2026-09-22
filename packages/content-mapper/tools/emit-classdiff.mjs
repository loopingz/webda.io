// Structural diff of emitted JavaScript: compares each class's members as a
// set — name, kind, static, normalised body — so member order and comments
// cannot register as differences but anything that can change behaviour does.
//
// Usage: node emit-classdiff.mjs <tsc6-lib> <tsgo-lib>
//
// Needs TypeScript 6 — it parses with the classic API — so run it from a
// directory where that resolves, e.g. packages/compiler. Exits 1 on any
// finding. This is the oracle for stage 9: byte-identity is the wrong bar,
// because the generators rewrite accessors in place (with their JSDoc) where
// the TypeScript 6 transformers appended them, so member order and comments
// are ignored and anything else that differs is reported.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createRequire } from "node:module";

const ts = createRequire(process.cwd() + "/").call(null, "typescript");
const [A, B] = process.argv.slice(2);

const walk = dir =>
  readdirSync(dir).flatMap(n => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".js") ? [p] : [];
  });

/** Print a node without comments, whitespace-normalised. */
const printer = ts.createPrinter({ removeComments: true });
const text = (node, sf) => printer.printNode(ts.EmitHint.Unspecified, node, sf).replace(/\s+/g, " ").trim();

/**
 * Inert rewrites the generator makes, normalised away so they cannot mask
 * anything else: `x ?? undefined` is `x`.
 */
const normaliseBody = s => s.replace(/ \?\? undefined/g, "");

function shape(file) {
  const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const classes = new Map();
  // Every class, including the ones ES decorators wrap in
  // `let X = (() => { ... return class X ... })()`.
  const visit = node => {
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      const members = new Map();
      for (const m of node.members) {
        const isStatic = !!m.modifiers?.some(x => x.kind === ts.SyntaxKind.StaticKeyword);
        const name = m.name ? text(m.name, sf) : ts.SyntaxKind[m.kind];
        members.set(`${isStatic ? "static " : ""}${ts.SyntaxKind[m.kind]} ${name}`, normaliseBody(text(m, sf)));
      }
      classes.set(node.name?.text ?? "<anonymous>", { members });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  // Top-level statements with every class body blanked, so the decorator
  // plumbing around a class is still compared but its members are not
  // compared twice.
  const blank = ctx => root => {
    const v = node =>
      ts.isClassDeclaration(node) || ts.isClassExpression(node)
        ? ts.factory.updateClassExpression
          ? (ts.isClassDeclaration(node)
              ? ts.factory.updateClassDeclaration(node, node.modifiers, node.name, node.typeParameters, node.heritageClauses, [])
              : ts.factory.updateClassExpression(node, node.modifiers, node.name, node.typeParameters, node.heritageClauses, []))
          : node
        : ts.visitEachChild(node, v, ctx);
    return ts.visitNode(root, v);
  };
  const blanked = ts.transform(sf, [blank]).transformed[0];
  const top = blanked.statements.map(st => text(st, blanked)).sort();
  return { classes, top };
}

const findings = [];
const add = (file, where, what) => findings.push({ file, where, what });
for (const fa of walk(A)) {
  const rel = relative(A, fa);
  const fb = join(B, rel);
  let sb;
  try { sb = shape(fb); } catch { add(rel, "file", "missing in tsgo output"); continue; }
  const sa = shape(fa);
  const ta = new Set(sa.top), tb = new Set(sb.top);
  for (const s of ta) if (!tb.has(s)) add(rel, "top-level", `only tsc6: ${s.slice(0, 140)}`);
  for (const s of tb) if (!ta.has(s)) add(rel, "top-level", `only tsgo: ${s.slice(0, 140)}`);
  for (const [name, ca] of sa.classes) {
    const cb = sb.classes.get(name);
    if (!cb) { add(rel, name, "class missing in tsgo output"); continue; }
    for (const [key, body] of ca.members) {
      if (!cb.members.has(key)) add(rel, name, `member only in tsc6: ${key}`);
      else if (cb.members.get(key) !== body) add(rel, name, `member differs: ${key}\n        tsc6: ${body.slice(0, 160)}\n        tsgo: ${cb.members.get(key).slice(0, 160)}`);
    }
    for (const key of cb.members.keys()) if (!ca.members.has(key)) add(rel, name, `member only in tsgo: ${key}`);
  }
}

const byKind = {};
for (const f of findings) {
  const k = f.what.split(":")[0];
  byKind[k] = (byKind[k] ?? 0) + 1;
}
console.log(`files=${walk(A).length} findings=${findings.length}`, JSON.stringify(byKind));
for (const f of findings) console.log(`  ${f.file} [${f.where}] ${f.what}`);
process.exitCode = findings.length ? 1 : 0;
