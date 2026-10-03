import { callOperation, Session, SimpleOperationContext } from "@webda/core";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { useLog } from "@webda/workout";
import type { ToolEntry } from "./tools.js";

/**
 * Raised when an MCP client cancels a running operation
 */
export class CancelledError extends Error {
  constructor() {
    super("Cancelled");
    this.name = "CancelledError";
  }
}

/**
 * Operation context used for MCP calls: collects AsyncGenerator chunks
 * instead of concatenating them into the output, and stops on cancellation.
 */
export class McpOperationContext extends SimpleOperationContext {
  /**
   * Chunks yielded by a streaming operation
   */
  chunks: unknown[] = [];
  /**
   * Abort signal of the MCP request
   */
  signal?: AbortSignal;
  /**
   * Called for every streamed chunk with its 1-based index
   */
  onChunk?: (chunk: unknown, index: number) => void;

  /**
   * @param output - chunk or result
   * @param encoding - unused for chunks
   * @param cb - unused for chunks
   * @returns true
   */
  write(output: any, encoding?: any, cb?: any): boolean {
    if (!this.getExtension("operationStreaming")) {
      return super.write(output, encoding, cb);
    }
    if (this.signal?.aborted) {
      // Throwing ends callOperation's for-await loop, which calls the generator's return()
      throw new CancelledError();
    }
    this.chunks.push(output);
    try {
      this.onChunk?.(output, this.chunks.length);
    } catch (err) {
      useLog("WARN", "MCP progress notification failed", err);
    }
    return true;
  }
}

/**
 * Options to run an operation for MCP
 */
export interface RunOptions {
  /**
   * Session of the caller; permissions are evaluated against it
   */
  session: Session;
  /**
   * Operation input (tool arguments)
   */
  input?: unknown;
  /**
   * Abort signal of the MCP request
   */
  signal?: AbortSignal;
  /**
   * Streaming chunk callback
   */
  onChunk?: (chunk: unknown, index: number) => void;
}

/**
 * Build a context holding a session, for permission checks
 * @param session - caller session
 * @returns a context with that session
 */
export function sessionContext(session: Session): SimpleOperationContext {
  const ctx = new SimpleOperationContext();
  ctx.setSession(session);
  return ctx;
}

/**
 * Run an operation as the caller through core `callOperation`
 * (permission, validation, events, audit and dispatch all apply)
 * @param operationId - operation id
 * @param options - session, input, cancellation and streaming hooks
 * @returns the parsed result, or the chunks when the operation streamed
 */
export async function runOperation(operationId: string, options: RunOptions): Promise<{ value: unknown; streamed: boolean }> {
  const ctx = new McpOperationContext();
  await ctx.init();
  ctx.setSession(options.session);
  ctx.setInput(Buffer.from(JSON.stringify(options.input ?? {})));
  ctx.signal = options.signal;
  ctx.onChunk = options.onChunk;
  await callOperation(ctx, operationId);
  if (ctx.getExtension("operationStreaming")) {
    return { value: ctx.chunks, streamed: true };
  }
  const output = ctx.getOutput();
  if (output === undefined || output === null || output === "") {
    return { value: undefined, streamed: false };
  }
  try {
    return { value: JSON.parse(output), streamed: false };
  } catch {
    return { value: output, streamed: false };
  }
}

/**
 * Convert an operation result into an MCP tool result
 * @param entry - the tool
 * @param value - operation result
 * @param streamed - whether value is the list of streamed chunks
 * @param maxOutputBytes - truncation threshold for the text content
 * @returns the tool result
 */
export function toToolResult(entry: ToolEntry, value: unknown, streamed: boolean, maxOutputBytes: number): CallToolResult {
  let structured: Record<string, unknown> | undefined;
  if (streamed) {
    structured = { items: value };
  } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    structured = value as Record<string, unknown>;
  } else if (value !== undefined) {
    structured = { value };
  }
  const text = structured === undefined ? "" : JSON.stringify(structured);
  if (Buffer.byteLength(text) > maxOutputBytes) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `${Buffer.from(text).subarray(0, maxOutputBytes).toString()}\n[output truncated: ${Buffer.byteLength(text)} bytes exceeds maxOutputBytes ${maxOutputBytes}]`
        }
      ]
    };
  }
  const result: CallToolResult = { content: [{ type: "text", text }] };
  if (entry.tool.outputSchema) {
    // The SDK client requires structuredContent whenever the tool declares an output schema
    result.structuredContent = structured ?? {};
  }
  return result;
}

/**
 * Convert an error into an MCP tool error result.
 * Client errors (4xx) are returned so the agent can correct its input;
 * anything else is logged and masked.
 * @param err - the error
 * @returns the tool error result
 */
export function errorToToolResult(err: unknown): CallToolResult {
  if (err instanceof CancelledError) {
    return { isError: true, content: [{ type: "text", text: "Cancelled" }] };
  }
  const code = typeof (err as any)?.getResponseCode === "function" ? (err as any).getResponseCode() : 500;
  if (code >= 400 && code < 500) {
    return { isError: true, content: [{ type: "text", text: `${(err as any).getCode()}: ${(err as Error).message}` }] };
  }
  useLog("ERROR", "MCP tool call failed", err);
  return { isError: true, content: [{ type: "text", text: "Internal error" }] };
}
