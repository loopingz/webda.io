import { callOperation, Session, SimpleOperationContext, WebdaError } from "@webda/core";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { JSONUtils } from "@webda/utils";
import { useLog } from "@webda/workout";
import type { ToolEntry } from "./tools.js";

/**
 * Raised when an MCP client cancels a running operation
 */
export class CancelledError extends Error {
  /**
   * Build the cancellation error
   */
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
    // Same public-audience filtering as OperationContext.write: `__` keys never leave the server
    const chunk = output === undefined ? output : JSON.parse(JSONUtils.stringify(output, undefined, 0, true));
    this.chunks.push(chunk);
    try {
      this.onChunk?.(chunk, this.chunks.length);
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
export async function runOperation(
  operationId: string,
  options: RunOptions
): Promise<{ value: unknown; streamed: boolean }> {
  if (options.signal?.aborted) {
    throw new CancelledError();
  }
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
 * Truncate a string to at most `maxBytes` UTF-8 bytes without cutting a character
 * @param text - the text
 * @param maxBytes - maximum number of bytes kept
 * @returns the (possibly) truncated text, whether it was truncated and the original byte length
 */
export function truncateUtf8(text: string, maxBytes: number): { text: string; truncated: boolean; bytes: number } {
  const bytes = Buffer.from(text);
  if (bytes.length <= maxBytes) {
    return { text, truncated: false, bytes: bytes.length };
  }
  // Back off to a valid UTF-8 boundary so a cut multibyte character is dropped, not replaced
  let end = Math.max(0, maxBytes);
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) {
    end--;
  }
  return { text: bytes.subarray(0, end).toString(), truncated: true, bytes: bytes.length };
}

/**
 * Convert an operation result into an MCP tool result.
 *
 * Tools declare no outputSchema (serialized models rarely match their schema exactly),
 * so structuredContent is informative only: the object itself, `{ value }` for scalars
 * and arrays, `{ items }` for streamed chunks, and nothing for void.
 * @param _entry - the tool
 * @param value - operation result
 * @param streamed - whether value is the list of streamed chunks
 * @param maxOutputBytes - truncation threshold for the text content
 * @returns the tool result
 */
export function toToolResult(
  _entry: ToolEntry,
  value: unknown,
  streamed: boolean,
  maxOutputBytes: number
): CallToolResult {
  let structured: Record<string, unknown> | undefined;
  if (streamed) {
    structured = { items: value };
  } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    structured = value as Record<string, unknown>;
  } else if (value !== undefined) {
    structured = { value };
  }
  if (structured === undefined) {
    return { content: [{ type: "text", text: "" }] };
  }
  const json = JSON.stringify(structured);
  const cut = truncateUtf8(json, maxOutputBytes);
  if (cut.truncated) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `${cut.text}\n[output truncated: ${cut.bytes} bytes exceeds maxOutputBytes ${maxOutputBytes}]`
        }
      ]
    };
  }
  return { content: [{ type: "text", text: json }], structuredContent: structured };
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
  if (err instanceof WebdaError.CodeError) {
    const code = err.getResponseCode();
    if (code >= 400 && code < 500) {
      return { isError: true, content: [{ type: "text", text: `${err.getCode()}: ${err.message}` }] };
    }
  }
  useLog("ERROR", "MCP tool call failed", err);
  return { isError: true, content: [{ type: "text", text: "Internal error" }] };
}
