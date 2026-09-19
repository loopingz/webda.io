// Measures editor latency: didChange -> diagnostics, with the content mapper live.
//
// Simulates typing a new property into a model file, one character at a time,
// and measures the round trip to a pull-diagnostics response after each
// keystroke. The mapper's own log gives the transform cost inside that window.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const pj = require.resolve(`@typescript/typescript-${process.platform}-${process.arch}/package.json`);
const tsgo = join(dirname(pj), "lib", "tsc");

const p = spawn(tsgo, ["--lsp", "--stdio"], { cwd: here, stdio: ["pipe", "pipe", "inherit"] });
const send = m => { const b = Buffer.from(JSON.stringify(m)); p.stdin.write(`Content-Length: ${b.length}\r\n\r\n`); p.stdin.write(b); };

let buf = Buffer.alloc(0); const inbox = [];
p.stdout.on("data", c => {
  buf = Buffer.concat([buf, c]);
  for (;;) {
    const he = buf.indexOf("\r\n\r\n"); if (he === -1) break;
    const len = Number(/Content-Length:\s*(\d+)/i.exec(buf.subarray(0, he).toString())?.[1]);
    if (buf.length < he + 4 + len) break;
    const m = JSON.parse(buf.subarray(he + 4, he + 4 + len).toString());
    buf = buf.subarray(he + 4 + len); inbox.push(m);
    if (m.id !== undefined && m.method) {
      send({ jsonrpc: "2.0", id: m.id, result: m.method === "workspace/configuration" ? (m.params?.items ?? [{}]).map(() => ({})) : null });
    }
  }
});
const wait = (pred, ms = 30000) => new Promise((res, rej) => {
  const t = setInterval(() => { const m = inbox.find(pred); if (m) { clearInterval(t); res(m); } }, 1);
  setTimeout(() => { clearInterval(t); rej(new Error("timeout")); }, ms);
});

const root = pathToFileURL(here).href;
const t0 = Date.now();
send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
  processId: process.pid, rootUri: root,
  initializationOptions: { runExternalCode: true },
  capabilities: { textDocument: { synchronization: { dynamicRegistration: false }, publishDiagnostics: {}, hover: {}, diagnostic: {} } },
  workspaceFolders: [{ uri: root, name: "bench" }] } });
await wait(m => m.id === 1);
send({ jsonrpc: "2.0", method: "initialized", params: {} });

const file = join(here, "src", "models", "m042.model.ts");
const uri = pathToFileURL(file).href;
let text = readFileSync(file, "utf8");
send({ jsonrpc: "2.0", method: "textDocument/didOpen", params: { textDocument: { uri, languageId: "typescript", version: 1, text } } });

let id = 100;
const pull = async () => { const i = ++id; send({ jsonrpc: "2.0", id: i, method: "textDocument/diagnostic", params: { textDocument: { uri } } }); return wait(m => m.id === i); };
const first = await pull();
console.log(`cold open -> first diagnostics: ${Date.now() - t0}ms, items=${first.result?.items?.length ?? 0}`);

// Type `  deletedAt: Date;` into the class body, one character at a time.
const anchor = text.indexOf("  label: string = \"\";");
const typed = "\n  deletedAt: Date;";
const samples = [];
let version = 1;

for (let i = 1; i <= typed.length; i++) {
  const insert = typed.slice(0, i);
  const next = text.slice(0, anchor) + insert.replace(/^\n/, "") + "\n" + text.slice(anchor);
  const start = process.hrtime.bigint();
  send({ jsonrpc: "2.0", method: "textDocument/didChange", params: {
    textDocument: { uri, version: ++version },
    contentChanges: [{ text: next }] } });
  const d = await pull();
  samples.push({ ms: Number(process.hrtime.bigint() - start) / 1e6, items: d.result?.items?.length ?? 0 });
}

const v = samples.map(s => s.ms).sort((a, b) => a - b);
const q = f => v[Math.min(v.length - 1, Math.floor(v.length * f))];
console.log(`\nkeystrokes: ${v.length}`);
console.log(`didChange -> diagnostics   min ${v[0].toFixed(1)}ms  p50 ${q(0.5).toFixed(1)}ms  p95 ${q(0.95).toFixed(1)}ms  max ${v[v.length - 1].toFixed(1)}ms`);
console.log(`final diagnostics: ${samples[samples.length - 1].items}`);

// Hover on the freshly typed property, to prove it is understood as an accessor.
const finalText = text.slice(0, anchor) + typed.replace(/^\n/, "") + "\n" + text.slice(anchor);
const at = finalText.indexOf("deletedAt");
const before = finalText.slice(0, at);
const line = before.split("\n").length - 1;
const character = at - (before.lastIndexOf("\n") + 1);
send({ jsonrpc: "2.0", id: 900, method: "textDocument/hover", params: { textDocument: { uri }, position: { line, character } } });
const h = await wait(m => m.id === 900).catch(() => null);
const hv = h?.result?.contents;
console.log("hover on typed field ->", hv ? JSON.stringify(typeof hv === "string" ? hv : (hv.value ?? hv)).slice(0, 100) : "(none)");

send({ jsonrpc: "2.0", id: 999, method: "shutdown", params: null });
await new Promise(r => setTimeout(r, 200)); p.kill();
