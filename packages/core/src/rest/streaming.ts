import { useLog } from "@webda/workout";
import type { ServerResponse } from "node:http";
import { callOperation, getOperationStreaming } from "../core/operations.js";
import { useInstanceStorage } from "../core/instancestorage.js";
import type { WebContext } from "../contexts/webcontext.js";
import { RestStreamingOperationContext, type RestStreamFormat } from "../contexts/restcontext.js";

/**
 * Run an operation for a route: a server-streaming one is streamed to the client as its generator yields, any other
 * is called and its result flushed with the response
 * @param context - the request context
 * @param operationId - the operation
 * @param keepAliveInterval - the keep-alive interval in ms for a stream
 * @returns a promise settled once the operation is done (a stream: once the response is over)
 */
export async function runOperation(
  context: WebContext,
  operationId: string,
  keepAliveInterval?: number
): Promise<void> {
  const response = context._stream as any;
  if (
    getOperationStreaming(useInstanceStorage().operations?.[operationId]) !== "server" ||
    typeof response?.writeHead !== "function"
  ) {
    return callOperation(context, operationId);
  }
  return streamOperation(context, operationId, response, keepAliveInterval);
}

/**
 * Stream a server-streaming operation: NDJSON, or server-sent events when the client accepts them
 *
 * The streaming context is built here, from the request's context, rather than by the HttpServer: only these routes
 * need it, and permissions, validation and events still go through `callOperation` on the request's input. Until the
 * first chunk an error is a normal HTTP error (thrown to the HttpServer); after it, the error is the last event or
 * line of the stream.
 * @param context - the request context
 * @param operationId - the operation
 * @param response - the HTTP response
 * @param keepAliveInterval - the keep-alive interval in ms
 * @returns a promise settled once the response is over
 */
async function streamOperation(
  context: WebContext,
  operationId: string,
  response: ServerResponse,
  keepAliveInterval?: number
): Promise<void> {
  const accept = context.getHttpContext().getUniqueHeader("accept", "") ?? "";
  const format: RestStreamFormat = accept.includes("text/event-stream") ? "sse" : "ndjson";
  const stream = new RestStreamingOperationContext(
    context.getHttpContext(),
    response,
    format,
    context.getSession(),
    keepAliveInterval,
    context.getResponseHeaders(),
    context.getSetCookieHeaders()
  );
  await stream.init();
  stream.setParameters(context.getParameters());
  stream.startKeepAlive();
  try {
    await callOperation(stream, operationId);
  } catch (err: any) {
    stream.stopKeepAlive();
    // The client went away: nothing to tell
    if (stream.isCancelled || stream.disconnected) return stream.finish();
    // Nothing sent yet: a normal HTTP error response
    if (!stream.hasStarted) {
      stream.abortBeforeStart();
      throw err;
    }
    const status = typeof err?.getResponseCode === "function" ? err.getResponseCode() : undefined;
    const clientError = status >= 400 && status < 500;
    if (!clientError) useLog("ERROR", `[REST ${operationId}] streamed operation threw:`, err);
    await stream.writeError(clientError ? String(err.message ?? "Error") : "Internal server error", status || 500);
    return stream.finish();
  }
  stream.stopKeepAlive();
  if (stream.isCancelled) return stream.finish();
  if (!stream.getExtension("operationStreaming")) {
    // Not a generator after all: a normal response, with the status and headers the operation set
    if (stream.statusCode && stream.statusCode !== 204) context.statusCode = stream.statusCode;
    for (const [name, value] of Object.entries(stream.getResponseHeaders())) context.setHeader(name, <any>value);
    const output = stream.getOutput();
    if (output !== undefined) {
      context.setHeader("Content-type", "application/json");
      context.write(output);
    }
    return;
  }
  return stream.finish(true);
}
