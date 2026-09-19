// Drives a real LSP session against raw tsgo or the injecting proxy.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const mode = process.argv[2];
const require = createRequire(import.meta.url);
const pj = require.resolve(`@typescript/typescript-${process.platform}-${process.arch}/package.json`);
const tsgo = require("path").join(require("path").dirname(pj), "lib", "tsc");
const cmd = mode === "inject" ? process.execPath : tsgo;
const args = mode === "inject" ? ["lib/lsp-inject.js", "--lsp", "--stdio"] : ["--lsp", "--stdio"];

const p = spawn(cmd, args, { stdio:["pipe","pipe","inherit"],
  env:{ ...process.env, WEBDA_TSGO_PATH: tsgo, WEBDA_STORAGE_MODULE: "./models.js" }});
const send = m => { const b=Buffer.from(JSON.stringify(m)); p.stdin.write(`Content-Length: ${b.length}\r\n\r\n`); p.stdin.write(b); };

let buf = Buffer.alloc(0); const inbox = [];
p.stdout.on("data", c => { buf = Buffer.concat([buf,c]);
  for(;;){ const he=buf.indexOf("\r\n\r\n"); if(he===-1)break;
    const len=Number(/Content-Length:\s*(\d+)/i.exec(buf.subarray(0,he).toString())?.[1]);
    if(buf.length<he+4+len)break;
    const m=JSON.parse(buf.subarray(he+4,he+4+len).toString()); buf=buf.subarray(he+4+len); inbox.push(m);
    if(m.id!==undefined&&m.method){ send({jsonrpc:"2.0",id:m.id,result:m.method==="workspace/configuration"?(m.params?.items??[{}]).map(()=>({})):null}); }
  }});
const wait = (pred, ms=6000) => new Promise((res,rej)=>{ const t=setInterval(()=>{ const m=inbox.find(pred); if(m){clearInterval(t);res(m);} },50); setTimeout(()=>{clearInterval(t);rej(new Error("timeout"))},ms); });

const root = process.cwd()+"/fixture";
const open = f => { const uri=pathToFileURL(root+"/src/"+f).href;
  send({jsonrpc:"2.0",method:"textDocument/didOpen",params:{textDocument:{uri,languageId:"typescript",version:1,text:readFileSync(root+"/src/"+f,"utf8")}}}); return uri; };

send({jsonrpc:"2.0",id:1,method:"initialize",params:{processId:process.pid,rootUri:pathToFileURL(root).href,
  capabilities:{textDocument:{synchronization:{dynamicRegistration:false},publishDiagnostics:{},hover:{contentFormat:["plaintext"]},completion:{}}},
  workspaceFolders:[{uri:pathToFileURL(root).href,name:"fixture"}]}});
const initRes = await wait(m=>m.id===1);
console.log(`\n### mode=${mode}`);
console.log("  textDocumentSync advertised:", JSON.stringify(initRes.result?.capabilities?.textDocumentSync));
send({jsonrpc:"2.0",method:"initialized",params:{}});
await new Promise(r=>setTimeout(r,1200));

open("user.ts"); const editUri = open("editing.ts");
await new Promise(r=>setTimeout(r,2500));

send({jsonrpc:"2.0",id:50,method:"textDocument/diagnostic",params:{textDocument:{uri:editUri}}});
const d = await wait(m=>m.id===50).catch(()=>null);
const items = d?.result?.items ?? [];
console.log(`  editing.ts diagnostics: ${items.length}`);
for(const x of items) console.log(`    line ${x.range.start.line}  TS${x.code}: ${String(x.message).slice(0,70)}`);

// hover over `createdAt` in `u.createdAt.getFullYear()` (line 5)
send({jsonrpc:"2.0",id:60,method:"textDocument/hover",params:{textDocument:{uri:editUri},position:{line:5,character:21}}});
const h = await wait(m=>m.id===60).catch(()=>null);
const hv = h?.result?.contents;
console.log("  hover@editing.ts:5:21 ->", hv? JSON.stringify(typeof hv==="string"?hv:(hv.value??hv)).slice(0,110):"(none)");

send({jsonrpc:"2.0",id:99,method:"shutdown",params:null});
await new Promise(r=>setTimeout(r,300)); p.kill();
