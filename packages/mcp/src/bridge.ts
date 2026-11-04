import type { WebContext } from "@webda/core";

/**
 * Build a web-standard Request from a Webda context
 * @param ctx - the request context
 * @param body - raw request body (POST only)
 * @param origin - request origin, when HttpContext.getAbsoluteUrl cannot represent it (IPv6 hosts)
 * @returns the Request handed to the SDK transport
 */
export function toRequest(ctx: WebContext, body?: string, origin?: URL): Request {
  const http = ctx.getHttpContext();
  const headers = new Headers();
  for (const [name, value] of Object.entries(http.getHeaders())) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      value.forEach(v => headers.append(name, v));
    } else {
      headers.set(name, String(value));
    }
  }
  const method = http.getMethod();
  const uri = http.getUrl();
  const url =
    origin && !/^\w{1,10}:\/\//.test(uri)
      ? `${origin.origin}${uri.startsWith("/") ? "" : "/"}${uri}`
      : http.getAbsoluteUrl();
  return new Request(url, { method, headers, body: method === "POST" ? (body ?? "") : undefined });
}

/**
 * Write a web-standard Response into a Webda context, streaming the body
 * chunk by chunk (SSE) and stopping when the client disconnects.
 * The returned promise settles when the body is fully written.
 * @param ctx - the request context
 * @param response - the SDK transport response
 */
export async function writeResponse(ctx: WebContext, response: Response): Promise<void> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, name) => (headers[name] = value));
  ctx.writeHead(response.status, headers);
  const out: any = await ctx.getOutputStream();
  if (!response.body) {
    return;
  }
  const reader = response.body.getReader();
  const onClose = () => {
    reader.cancel().catch(() => {});
  };
  out.once?.("close", onClose);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      out.write(Buffer.from(value));
    }
  } catch {
    // client went away; nothing left to write
  } finally {
    out.off?.("close", onClose);
  }
}

/**
 * Answer with a JSON-RPC error body
 * @param ctx - the request context
 * @param status - HTTP status
 * @param code - JSON-RPC error code
 * @param message - error message
 */
export function jsonRpcError(ctx: WebContext, status: number, code: number, message: string): void {
  jsonRpcErrorResponse(ctx, status, { code, message });
}

/**
 * Answer with a JSON-RPC error body carrying data, a request id and extra headers
 * @param ctx - the request context
 * @param status - HTTP status
 * @param error - JSON-RPC error
 * @param error.code - JSON-RPC error code
 * @param error.message - error message
 * @param error.data - error data
 * @param id - id of the request answered
 * @param headers - extra response headers
 */
export function jsonRpcErrorResponse(
  ctx: WebContext,
  status: number,
  error: { code: number; message: string; data?: unknown },
  id: string | number | null = null,
  headers: Record<string, string> = {}
): void {
  ctx.writeHead(status, { "content-type": "application/json", ...headers });
  ctx.write(JSON.stringify({ jsonrpc: "2.0", error, id }));
}
