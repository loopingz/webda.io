/*harness*/// Drives a real LSP session against either raw tsgo or the proxy, and reports
// the diagnostics the editor would display for src/editing.ts.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const useProxy = process.argv[2] === "proxy";
const require = createRequire(import.meta.url);
const pj=require.resolve(`@typescript/typescript-${process.platform}-${process.arch}/package.json`);
const tsgo=require("path").join(require("path").dirname(pj),"lib","tsc");
const cmd  = useProxy ? process.cwd()+"/tsdk/tsgo" : tsgo;
const args = ["--lsp", "--stdio"];

const p = spawn(cmd, args, { stdio: ["pipe","pipe","inherit"], env: { ...process.env, WEBDA_TSGO_PATH: tsgo } });
const send = m => { const b = Buffer.from(JSON.stringify(m)); p.stdin.write(`Content-Length: ${b.length}\r\n\r\n`); p.stdin.write(b); };

let buf = Buffer.alloc(0);
const seen = [];
p.stdout.on("data", c => {
  buf = Buffer.concat([buf, c]);
  for(;;){
    const he = buf.indexOf("\r\n\r\n"); if (he === -1) break;
    const len = Number(/Content-Length:\s*(\d+)/i.exec(buf.subarray(0,he).toString())?.[1]);
    if (buf.length < he+4+len) break;
    const msg = JSON.parse(buf.subarray(he+4, he+4+len).toString());
    buf = buf.subarray(he+4+len);
    // Answer server->client requests so registration does not get cancelled.
    if (msg.id !== undefined && msg.method) {
      const result = msg.method === "workspace/configuration" ? (msg.params?.items ?? [{}]).map(()=>({})) : null;
      send({ jsonrpc:"2.0", id: msg.id, result });
    }
    if (msg.method === "textDocument/publishDiagnostics" && msg.params.uri.endsWith("editing.ts")) seen.push(...msg.params.diagnostics);
    if (msg.id === 50 && msg.result?.items) seen.push(...msg.result.items);
  }
});

const root = process.cwd() + "/fixture";
const file = root + "/src/editing.ts";
send({ jsonrpc:"2.0", id:1, method:"initialize", params:{ processId:process.pid, rootUri:pathToFileURL(root).href, capabilities:{ textDocument:{ publishDiagnostics:{} } }, workspaceFolders:[{uri:pathToFileURL(root).href,name:"fixture"}] }});
await new Promise(r=>setTimeout(r,1500));
send({ jsonrpc:"2.0", method:"initialized", params:{} });
send({ jsonrpc:"2.0", method:"textDocument/didOpen", params:{ textDocument:{ uri:pathToFileURL(file).href, languageId:"typescript", version:1, text:readFileSync(file,"utf8") }}});
await new Promise(r=>setTimeout(r,2500));
send({ jsonrpc:"2.0", id:50, method:"textDocument/diagnostic", params:{ textDocument:{ uri: pathToFileURL(file).href } }});
await new Promise(r=>setTimeout(r,3000));
send({ jsonrpc:"2.0", id:99, method:"shutdown", params:null });
await new Promise(r=>setTimeout(r,300));
p.kill();
console.log(`mode=${useProxy?"PROXY":"RAW tsgo"}  diagnostics=${seen.length}`);
for (const d of seen) console.log(`   TS${d.code}: ${d.message}`);
