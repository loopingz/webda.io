#!/usr/bin/env node
/**
 * Injecting LSP middleware.
 *
 * Where `lsp-proxy.ts` merely *filters* the false TS2322 out of diagnostics,
 * this proxy rewrites the document text on its way to the server, so the server
 * type-checks the generated accessors. That is strictly better: the server's
 * own view is correct, so hover, completion and signature help all become right
 * automatically instead of each needing a bespoke override.
 *
 * This is the Volar "virtual document" pattern, with one simplification that
 * removes most of its cost: generation is **line-aligned** (see
 * `inject-scan.ts`), so line numbers are identical on both sides and only
 * columns on rewritten lines need mapping.
 *
 * Transport: VS Code spawns `<tsdk>/tsgo --lsp --stdio` (see
 * `_extension/src/client.ts`), so this sits in the tsdk directory under that
 * name.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { inject, mapBack, mapForward, type Injection } from "./inject-scan.ts";

/** Per-document injection state, keyed by document URI. */
const docs = new Map<string, Injection & { original: string }>();

/** Ids of client requests that carry positions we may need to map back. */
const positionalRequests = new Map<number | string, { uri: string }>();

/**
 * Locate the real tsgo executable this proxy fronts.
 * @returns absolute path to the compiler/server binary
 */
function realServerPath(): string {
  if (process.env.WEBDA_TSGO_PATH) return process.env.WEBDA_TSGO_PATH;
  const require = createRequire(import.meta.url);
  const pkg = `@typescript/typescript-${process.platform}-${process.arch}`;
  const pkgJson = require.resolve(`${pkg}/package.json`);
  return join(dirname(pkgJson), "lib", process.platform === "win32" ? "tsc.exe" : "tsc");
}

/**
 * Record a document and return the text the server should see.
 * @param uri - document URI
 * @param text - authored text
 * @returns injected text
 */
function trackDocument(uri: string, text: string): string {
  const result = inject(text);
  docs.set(uri, { ...result, original: text });
  return result.text;
}

/**
 * Map a client position (authored coords) to server coords.
 * Lines are identical by construction; only columns on rewritten lines shift.
 * @param uri - document URI
 * @param pos - LSP position
 */
function toServer(uri: string, pos: any): void {
  const doc = docs.get(uri);
  if (!doc || !pos || !doc.rewrittenLines.has(pos.line)) return;
  const segs = doc.segments.get(pos.line);
  if (segs) pos.character = mapForward(segs, pos.character);
}

/**
 * Clamp a server range (injected coords) back into the authored line.
 * @param uri - document URI
 * @param range - LSP range
 */
function toClientRange(uri: string, range: any): void {
  const doc = docs.get(uri);
  if (!doc || !range) return;
  const lines = doc.original.split("\n");
  for (const key of ["start", "end"] as const) {
    const p = range[key];
    if (!p || !doc.rewrittenLines.has(p.line)) continue;
    // Map back through the segment table, then clamp into the authored line so
    // a range over generated-only text can never point past the real content.
    const segs = doc.segments.get(p.line);
    if (segs) p.character = mapBack(segs, p.character);
    const max = (lines[p.line] ?? "").length;
    p.character = Math.max(0, Math.min(p.character, max));
  }
}

/**
 * Walk any structure and clamp every `range`/`selectionRange` it contains.
 * @param node - arbitrary LSP payload
 * @param uri - document URI
 */
function clampAll(node: any, uri: string): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) clampAll(item, uri);
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if ((key === "range" || key === "selectionRange" || key === "targetSelectionRange") && value) {
      toClientRange(uri, value);
    } else {
      clampAll(value, uri);
    }
  }
}

/**
 * Rewrite client -> server traffic.
 * @param msg - decoded message
 * @returns the message to forward
 */
function fromClient(msg: any): any {
  const uri = msg?.params?.textDocument?.uri;

  if (msg?.method === "textDocument/didOpen" && msg.params?.textDocument?.text !== undefined) {
    msg.params.textDocument.text = trackDocument(uri, msg.params.textDocument.text);
    return msg;
  }

  if (msg?.method === "textDocument/didChange" && Array.isArray(msg.params?.contentChanges)) {
    // Full sync is forced in `fromServer`, so there is exactly one change with
    // no range, carrying the whole document.
    const full = msg.params.contentChanges.find((c: any) => c.range === undefined);
    if (full) full.text = trackDocument(uri, full.text);
    return msg;
  }

  if (msg?.method === "textDocument/didClose") {
    docs.delete(uri);
    return msg;
  }

  if (msg?.params?.position && uri) {
    toServer(uri, msg.params.position);
    if (msg.id !== undefined) positionalRequests.set(msg.id, { uri });
  }

  return msg;
}

/**
 * Rewrite server -> client traffic.
 * @param msg - decoded message
 * @returns the message to forward
 */
function fromServer(msg: any): any {
  // Force full document sync so the proxy always receives whole-document text;
  // reconstructing incremental edits would mean reimplementing the document
  // model, and injection needs the full text anyway.
  if (msg?.result?.capabilities) {
    const caps = msg.result.capabilities;
    if (typeof caps.textDocumentSync === "object" && caps.textDocumentSync) {
      caps.textDocumentSync.change = 1; // TextDocumentSyncKind.Full
    } else if (typeof caps.textDocumentSync === "number") {
      caps.textDocumentSync = 1;
    }
  }

  if (msg?.method === "textDocument/publishDiagnostics" && msg.params?.uri) {
    clampAll(msg.params.diagnostics, msg.params.uri);
  }

  if (msg?.id !== undefined && positionalRequests.has(msg.id)) {
    const { uri } = positionalRequests.get(msg.id)!;
    positionalRequests.delete(msg.id);
    clampAll(msg.result, uri);
  }

  return msg;
}

/** Stream splitter for LSP `Content-Length` framing. */
class LspFramer {
  private buffer = Buffer.alloc(0);

  /**
   * Feed bytes and extract complete messages.
   * @param chunk - incoming bytes
   * @returns decoded messages
   */
  push(chunk: Buffer): any[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const out: any[] = [];
    for (;;) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) break;
      const header = this.buffer.subarray(0, headerEnd).toString("ascii");
      const match = /Content-Length:\s*(\d+)/i.exec(header);
      if (!match) {
        this.buffer = this.buffer.subarray(headerEnd + 4);
        continue;
      }
      const length = Number(match[1]);
      const start = headerEnd + 4;
      if (this.buffer.length < start + length) break;
      const body = this.buffer.subarray(start, start + length).toString("utf8");
      this.buffer = this.buffer.subarray(start + length);
      try {
        out.push(JSON.parse(body));
      } catch {
        out.push({ __raw: body });
      }
    }
    return out;
  }
}

/**
 * Encode a message with LSP framing.
 * @param msg - the message
 * @returns framed bytes
 */
function frame(msg: any): Buffer {
  const body = Buffer.from(msg.__raw ?? JSON.stringify(msg), "utf8");
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "ascii"), body]);
}

const passthrough = process.argv.slice(2).filter(a => a !== "--lsp" && a !== "--stdio");
const server = spawn(realServerPath(), ["--lsp", "--stdio", ...passthrough], {
  stdio: ["pipe", "pipe", "inherit"]
});

const clientFramer = new LspFramer();
process.stdin.on("data", (chunk: Buffer | string) => {
  const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  for (const msg of clientFramer.push(buf)) server.stdin.write(frame(fromClient(msg)));
});

const serverFramer = new LspFramer();
server.stdout.on("data", chunk => {
  for (const msg of serverFramer.push(chunk)) process.stdout.write(frame(fromServer(msg)));
});

server.on("exit", code => process.exit(code ?? 0));
process.on("SIGTERM", () => server.kill("SIGTERM"));
process.on("SIGINT", () => server.kill("SIGINT"));
