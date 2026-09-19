#!/usr/bin/env node
/**
 * LSP middleware — the TypeScript 7 replacement for `@webda/ts-plugin`.
 *
 * TS7 removed language-service plugins entirely (the tsgo binary contains no
 * plugin-loading machinery, and a tsconfig `plugins` entry is silently ignored).
 * The supported interception point is now the LSP stream itself.
 *
 * VS Code's "TypeScript 7" extension resolves its server by looking for an
 * executable literally named `tsc` or `tsgo` inside the configured tsdk
 * directory (`_extension/src/util.ts`, `packagedExeBaseNames`), then spawns it
 * as `<exe> --lsp` over stdio (`_extension/src/client.ts`). So dropping this
 * script into a directory as `tsgo` and pointing `js/ts.tsdk.path` at it is
 * enough to install middleware — no forking of the extension required.
 *
 * What it does: forwards everything verbatim, except it filters
 * `textDocument/publishDiagnostics` to drop the false TS2322 raised when a wide
 * value is assigned to a coercible field. This is the direct equivalent of
 * `getSemanticDiagnostics` in `packages/ts-plugin/src/index.ts:208`.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/** TS error code for "Type X is not assignable to type Y". */
const TS_NOT_ASSIGNABLE = 2322;

/**
 * Type names whose setters are widened by the Webda codegen. A diagnostic that
 * complains about assigning to one of these is suppressed.
 *
 * In a real implementation this would be sourced from the same analysis the
 * codegen uses, keyed by (file, position), rather than matched on message text.
 */
const COERCIBLE_TARGETS = ["Date"];

/**
 * Decide whether a diagnostic is a false positive introduced by a coercible
 * field, and should therefore be hidden from the editor.
 * @param diag - an LSP diagnostic
 * @returns true when the diagnostic should be dropped
 */
function isCoercibleFalsePositive(diag: any): boolean {
  if (diag?.code !== TS_NOT_ASSIGNABLE) return false;
  const message = String(diag.message ?? "");
  return COERCIBLE_TARGETS.some(t => new RegExp(`is not assignable to type '${t}'`).test(message));
}

/** Ids of in-flight `textDocument/diagnostic` requests made by the client. */
const pendingDiagnosticRequests = new Set<number | string>();

/**
 * Filter an array of diagnostics in place, reporting how many were dropped.
 * @param items - diagnostics to filter
 * @returns the filtered array
 */
function filterDiagnostics(items: any[]): any[] {
  const kept = items.filter(d => !isCoercibleFalsePositive(d));
  const dropped = items.length - kept.length;
  if (dropped > 0 && process.env.WEBDA_LSP_DEBUG) {
    process.stderr.write(`[webda-lsp] suppressed ${dropped} coercible TS2322\n`);
  }
  return kept;
}

/**
 * Recursively filter a diagnostic report, including `relatedDocuments`.
 * @param report - a full or unchanged document diagnostic report
 */
function filterReport(report: any): void {
  if (Array.isArray(report?.items)) report.items = filterDiagnostics(report.items);
  for (const related of Object.values(report?.relatedDocuments ?? {})) {
    filterReport(related);
  }
}

/**
 * Note client->server traffic so responses can be correlated.
 *
 * VS Code uses *pull* diagnostics (`textDocument/diagnostic`), so suppression
 * has to happen on the response to a request, not only on push notifications.
 * @param msg - the decoded message
 */
function observeClientMessage(msg: any): void {
  if (msg?.method === "textDocument/diagnostic" && msg.id !== undefined) {
    pendingDiagnosticRequests.add(msg.id);
  }
}

/**
 * Apply middleware to a single server->client message.
 * @param msg - the decoded JSON-RPC message
 * @returns the possibly-modified message
 */
function transform(msg: any): any {
  // Push diagnostics.
  if (msg?.method === "textDocument/publishDiagnostics" && Array.isArray(msg.params?.diagnostics)) {
    msg.params.diagnostics = filterDiagnostics(msg.params.diagnostics);
  }

  // Pull diagnostics: response to textDocument/diagnostic.
  if (msg?.id !== undefined && pendingDiagnosticRequests.has(msg.id)) {
    pendingDiagnosticRequests.delete(msg.id);
    if (msg.result) filterReport(msg.result);
  }

  // Workspace diagnostics.
  if (Array.isArray(msg?.result?.items)) {
    for (const item of msg.result.items) filterReport(item);
  }

  return msg;
}

/**
 * Locate the real tsgo executable that this proxy fronts.
 * @returns absolute path to the tsgo binary
 */
function realServerPath(): string {
  if (process.env.WEBDA_TSGO_PATH) return process.env.WEBDA_TSGO_PATH;
  // Mirrors `resolvePackageExecutable` in the VS Code extension: find the
  // platform-specific package next to `typescript` and take `lib/tsc`.
  const require = createRequire(import.meta.url);
  const platformPkg = `@typescript/typescript-${process.platform}-${process.arch}`;
  const pkgJson = require.resolve(`${platformPkg}/package.json`);
  return join(dirname(pkgJson), "lib", process.platform === "win32" ? "tsc.exe" : "tsc");
}

/**
 * Stream splitter for LSP's `Content-Length` framing.
 */
class LspFramer {
  private buffer = Buffer.alloc(0);

  /**
   * Feed bytes and extract any complete messages.
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
        // Forward undecodable payloads untouched rather than dropping them.
        out.push({ __raw: body });
      }
    }
    return out;
  }
}

/**
 * Encode a message with LSP framing.
 * @param msg - message to encode
 * @returns framed buffer
 */
function frame(msg: any): Buffer {
  const body = Buffer.from(msg.__raw ?? JSON.stringify(msg), "utf8");
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "ascii"), body]);
}

// VS Code spawns us as `<exe> --lsp --stdio` (TransportKind.stdio appends
// --stdio). Forward the same shape to the real server.
const passthrough = process.argv.slice(2).filter(a => a !== "--lsp" && a !== "--stdio");
const server = spawn(realServerPath(), ["--lsp", "--stdio", ...passthrough], {
  stdio: ["pipe", "pipe", "inherit"]
});

// client -> server: forwarded verbatim, but observed so pull-diagnostic
// responses can be correlated back to their requests.
const clientFramer = new LspFramer();
process.stdin.on("data", (chunk: Buffer | string) => {
  const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  for (const msg of clientFramer.push(buf)) observeClientMessage(msg);
  server.stdin.write(buf);
});

// server -> client: filtered.
const framer = new LspFramer();
server.stdout.on("data", chunk => {
  for (const msg of framer.push(chunk)) {
    process.stdout.write(frame(transform(msg)));
  }
});

server.on("exit", code => process.exit(code ?? 0));
process.on("SIGTERM", () => server.kill("SIGTERM"));
process.on("SIGINT", () => server.kill("SIGINT"));
