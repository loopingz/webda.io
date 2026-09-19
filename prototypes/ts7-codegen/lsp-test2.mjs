import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const mode=process.argv[2]; const require=createRequire(import.meta.url);
const pj=require.resolve(`@typescript/typescript-${process.platform}-${process.arch}/package.json`);
const tsgo=require("path").join(require("path").dirname(pj),"lib","tsc");
const p=spawn(mode==="inject"?process.execPath:tsgo, mode==="inject"?["lib/lsp-inject.js","--lsp","--stdio"]:["--lsp","--stdio"],
 {stdio:["pipe","pipe","inherit"],env:{...process.env,WEBDA_TSGO_PATH:tsgo,WEBDA_STORAGE_MODULE:"./models.js"}});
const send=m=>{const b=Buffer.from(JSON.stringify(m));p.stdin.write(`Content-Length: ${b.length}\r\n\r\n`);p.stdin.write(b);};
let buf=Buffer.alloc(0);const inbox=[];
p.stdout.on("data",c=>{buf=Buffer.concat([buf,c]);for(;;){const he=buf.indexOf("\r\n\r\n");if(he===-1)break;
 const len=Number(/Content-Length:\s*(\d+)/i.exec(buf.subarray(0,he).toString())?.[1]);if(buf.length<he+4+len)break;
 const m=JSON.parse(buf.subarray(he+4,he+4+len).toString());buf=buf.subarray(he+4+len);inbox.push(m);
 if(m.id!==undefined&&m.method)send({jsonrpc:"2.0",id:m.id,result:m.method==="workspace/configuration"?(m.params?.items??[{}]).map(()=>({})):null});}});
const wait=(pred,ms=6000)=>new Promise((res,rej)=>{const t=setInterval(()=>{const m=inbox.find(pred);if(m){clearInterval(t);res(m);}},50);setTimeout(()=>{clearInterval(t);rej(new Error("timeout"))},ms);});
const root=process.cwd()+"/fixture";
send({jsonrpc:"2.0",id:1,method:"initialize",params:{processId:process.pid,rootUri:pathToFileURL(root).href,
 capabilities:{textDocument:{synchronization:{},publishDiagnostics:{},hover:{},completion:{}}},workspaceFolders:[{uri:pathToFileURL(root).href,name:"fixture"}]}});
await wait(m=>m.id===1); send({jsonrpc:"2.0",method:"initialized",params:{}});
await new Promise(r=>setTimeout(r,1200));
const uri=pathToFileURL(root+"/src/user.ts").href;
send({jsonrpc:"2.0",method:"textDocument/didOpen",params:{textDocument:{uri,languageId:"typescript",version:1,text:readFileSync(root+"/src/user.ts","utf8")}}});
await new Promise(r=>setTimeout(r,2500));
send({jsonrpc:"2.0",id:50,method:"textDocument/diagnostic",params:{textDocument:{uri}}});
const d=await wait(m=>m.id===50).catch(()=>null);
console.log(`\n### user.ts (the model file itself) mode=${mode}`);
for(const x of (d?.result?.items??[])) console.log(`   line ${x.range.start.line} col ${x.range.start.character}-${x.range.end.character}  TS${x.code}: ${String(x.message).slice(0,60)}`);
// hover directly on the rewritten declaration line (line 3 = createdAt)
send({jsonrpc:"2.0",id:61,method:"textDocument/hover",params:{textDocument:{uri},position:{line:3,character:4}}});
const h=await wait(m=>m.id===61).catch(()=>null);
console.log("   hover on decl line3 col4 ->", h?.result?.contents? JSON.stringify(h.result.contents).slice(0,90):"(none)", h?.result?.range?JSON.stringify(h.result.range):"");
// completion inside the class
send({jsonrpc:"2.0",id:62,method:"textDocument/completion",params:{textDocument:{uri},position:{line:6,character:45}}});
const c=await wait(m=>m.id===62).catch(()=>null);
const items=c?.result?.items??c?.result??[];
console.log("   completion count:", Array.isArray(items)?items.length:"n/a");
send({jsonrpc:"2.0",id:99,method:"shutdown",params:null});await new Promise(r=>setTimeout(r,300));p.kill();
