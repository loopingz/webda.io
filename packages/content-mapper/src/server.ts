/**
 * The content mapper process.
 *
 * Speaks the TypeScript 7.1 content mapper protocol over stdio (JSON-RPC with
 * LSP-style `Content-Length` framing). TypeScript drives every exchange:
 * `initialize` -> `openProject` -> `transform`* -> `closeProject`. Mappers never
 * send requests.
 *
 * All the interesting work is in {@link WarmSession}; this file is transport,
 * project bookkeeping and timing instrumentation.
 *
 * Diagnostics go to a log file rather than stderr, because stderr is consumed by
 * the compiler as mapper log output.
 */
import { appendFileSync } from "node:fs";
import { WarmSession, type TransformTiming } from "./session.ts";

const LOG = process.env.WEBDA_MAPPER_LOG;

/**
 * Append a line to the debug log, if one is configured.
 * @param parts - message parts
 */
function log(...parts: unknown[]): void {
  if (!LOG) return;
  appendFileSync(LOG, parts.map(p => (typeof p === "string" ? p : JSON.stringify(p))).join(" ") + "\n");
}

/** Everything held for one `projectHandle`. */
interface ProjectEntry {
  session: WarmSession;
  transforms: number;
  timings: TransformTiming[];
}

const projects = new Map<string, ProjectEntry>();

/**
 * Write a JSON-RPC message with `Content-Length` framing.
 * @param message - the message
 */
function send(message: unknown): void {
  const body = JSON.stringify(message);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`);
}

/**
 * Handle one request and reply.
 * @param message - the decoded request
 */
function handle(message: any): void {
  const { id, method, params } = message;
  try {
    let result: unknown;
    switch (method) {
      case "initialize":
        // UTF-16 matches JavaScript string offsets exactly, so no re-encoding.
        result = {
          positionEncoding: params.positionEncodings.includes("utf-16") ? "utf-16" : params.positionEncodings[0],
          diagnosticSource: "webda"
        };
        break;

      case "openProject": {
        const session = new WarmSession({
          configFile: params.configFileName,
          cwd: params.configFileName.replace(/[/\\][^/\\]+$/, ""),
          storageModule: (params.options?.storageModule as string) ?? "@webda/models",
          qlModule: params.options?.qlModule as string,
          accessorsForAll: !!params.options?.accessorsForAll
        });
        projects.set(params.projectHandle, { session, transforms: 0, timings: [] });
        log("openProject", params.configFileName, `startup=${session.startupMs.toFixed(0)}ms`, `files=${session.fileCount}`);
        result = {};
        break;
      }

      case "transform": {
        const entry = projects.get(params.projectHandle);
        if (!entry) throw new Error(`unknown projectHandle ${params.projectHandle}`);
        const outcome = entry.session.transform(params.fileName, params.content);
        entry.transforms++;
        entry.timings.push(outcome.timing);
        const t = outcome.timing;
        log(
          "transform",
          params.fileName.replace(/^.*\//, ""),
          `edits=${outcome.editCount}`,
          `spans=${outcome.mappings.length}`,
          `total=${t.totalMs.toFixed(1)}ms`,
          `(snapshot=${t.snapshotMs.toFixed(1)} analyze=${t.analyzeMs.toFixed(1)} splice=${t.spliceMs.toFixed(2)})`,
          t.changed ? "changed" : "cached"
        );
        // `diagnostics` reports problems against the *authored* file, which is
        // how a generator surfaces something it cannot fix by rewriting.
        result = {
          text: outcome.text,
          extension: ".ts",
          mappings: outcome.mappings,
          ...(outcome.diagnostics.length ? { diagnostics: outcome.diagnostics } : {})
        };
        break;
      }

      case "closeProject": {
        const entry = projects.get(params.projectHandle);
        if (entry) {
          entry.session.dispose();
          projects.delete(params.projectHandle);
          log("closeProject", `transforms=${entry.transforms}`);
        }
        result = {};
        break;
      }

      default:
        send({ jsonrpc: "2.0", id, error: { code: -32601, message: `unknown method ${method}` } });
        return;
    }
    if (id !== undefined) send({ jsonrpc: "2.0", id, result });
  } catch (error: any) {
    log("ERROR", method, error?.stack ?? String(error));
    if (id !== undefined) send({ jsonrpc: "2.0", id, error: { code: -32603, message: String(error?.message ?? error) } });
  }
}

let buffer = Buffer.alloc(0);
process.stdin.on("data", (chunk: Buffer) => {
  buffer = Buffer.concat([buffer, chunk]);
  for (;;) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd < 0) return;
    const header = buffer.subarray(0, headerEnd).toString("ascii");
    const match = /Content-Length:\s*(\d+)/i.exec(header);
    if (!match) {
      log("malformed header", header);
      process.exit(1);
    }
    const length = Number(match[1]);
    if (buffer.length < headerEnd + 4 + length) return;
    const body = buffer.subarray(headerEnd + 4, headerEnd + 4 + length).toString("utf8");
    buffer = buffer.subarray(headerEnd + 4 + length);
    handle(JSON.parse(body));
  }
});

process.on("exit", () => {
  for (const entry of projects.values()) entry.session.dispose();
});

log("mapper started", process.argv.join(" "));
