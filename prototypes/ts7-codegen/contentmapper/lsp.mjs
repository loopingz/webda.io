import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const require_ = (await import("node:module")).createRequire(import.meta.url);
const path_ = await import("node:path");
const TSGO = path_.join(path_.dirname(require_.resolve(`@typescript/typescript-${process.platform}-${process.arch}/package.json`)), "lib", "tsc");
const root = path_.dirname(new URL(import.meta.url).pathname);
const external = process.argv.includes("external");
const args = ["--lsp", "--stdio"];

const p = spawn(TSGO, args, { cwd: root, stdio: ["pipe", "pipe", "inherit"] });
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
const wait = (pred, ms = 8000) => new Promise((res, rej) => {
  const t = setInterval(() => { const m = inbox.find(pred); if (m) { clearInterval(t); res(m); } }, 50);
  setTimeout(() => { clearInterval(t); rej(new Error("timeout")); }, ms);
});

send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
  processId: process.pid, rootUri: pathToFileURL(root).href, initializationOptions: { runExternalCode: external },
  capabilities: { textDocument: { synchronization: { dynamicRegistration: false }, publishDiagnostics: {}, hover: { contentFormat: ["plaintext"] }, completion: {} } },
  workspaceFolders: [{ uri: pathToFileURL(root).href, name: "cmtest" }] } });
await wait(m => m.id === 1);
send({ jsonrpc: "2.0", method: "initialized", params: {} });
await new Promise(r => setTimeout(r, 1200));

const f = root + "/src/user.wts";
const uri = pathToFileURL(f).href;
const text = readFileSync(f, "utf8");
send({ jsonrpc: "2.0", method: "textDocument/didOpen", params: { textDocument: { uri, languageId: "webda", version: 1, text } } });
await new Promise(r => setTimeout(r, 2500));

console.log(`\n===== ${external ? "WITH --runExternalCode (content mapper)" : "WITHOUT --runExternalCode (raw)"} =====`);
console.log("source:", JSON.stringify(text));

send({ jsonrpc: "2.0", id: 50, method: "textDocument/diagnostic", params: { textDocument: { uri } } });
const d = await wait(m => m.id === 50).catch(() => null);
const items = d?.result?.items ?? [];
console.log(`diagnostics: ${items.length}`);
for (const x of items) console.log(`   ${x.range.start.line}:${x.range.start.character}-${x.range.end.character}  TS${x.code}: ${String(x.message).slice(0, 80)}`);

for (const [label, line, ch] of [["createdAt ident", 1, 4], ["Date type", 1, 14], ["name ident", 2, 3]]) {
  send({ jsonrpc: "2.0", id: 100 + line * 10 + ch, method: "textDocument/hover", params: { textDocument: { uri }, position: { line, character: ch } } });
  const h = await wait(m => m.id === 100 + line * 10 + ch).catch(() => null);
  const hv = h?.result?.contents;
  console.log(`hover ${label.padEnd(16)} (${line}:${ch}) ->`, hv ? JSON.stringify(typeof hv === "string" ? hv : (hv.value ?? hv)).slice(0, 120) : "(none)");
}

send({ jsonrpc: "2.0", id: 99, method: "shutdown", params: null });
await new Promise(r => setTimeout(r, 300)); p.kill();
