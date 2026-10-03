import { canCallOperation, Session, WebdaError } from "@webda/core";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
  Resource
} from "@modelcontextprotocol/sdk/types.js";
import { useLog } from "@webda/workout";
import { errorToToolResult, runOperation, sessionContext, toToolResult } from "./invoke.js";
import { decodeCursor, encodeCursor, queryFor, ResourceRegistry } from "./resources.js";
import { ToolRegistry } from "./tools.js";

/**
 * JSON-RPC error code for a missing resource (MCP spec)
 */
export const RESOURCE_NOT_FOUND = -32002;

/**
 * Number of tools per tools/list page
 */
export const TOOLS_PAGE_SIZE = 100;

/**
 * Dependencies of an MCP server instance
 */
export interface McpServerOptions {
  /**
   * Server name and version announced at initialize
   */
  info: { name: string; version: string };
  /**
   * Tools exposed
   */
  tools: ToolRegistry;
  /**
   * Resources exposed; undefined disables resources
   */
  resources?: ResourceRegistry;
  /**
   * Truncation threshold for tool and resource text
   */
  maxOutputBytes: number;
  /**
   * Caller session for a request
   */
  getSession: (extra: { authInfo?: AuthInfo }) => Session;
  /**
   * Hook run before tools/resources requests (tool list change detection)
   */
  beforeRequest?: () => void;
}

/**
 * Map an error thrown by a resource operation to an MCP error.
 *
 * With a `uri` (resources/read) a NotFound becomes RESOURCE_NOT_FOUND; without
 * one (resources/list) a NotFound is treated like any other client error.
 * Other 4xx messages are forwarded, anything else is logged and masked.
 * @param err - thrown error
 * @param uri - requested resource uri, when reading one resource
 * @returns the error to throw
 */
function toResourceError(err: unknown, uri?: string): McpError {
  if (err instanceof McpError) {
    return err;
  }
  if (uri !== undefined && err instanceof WebdaError.NotFound) {
    return new McpError(RESOURCE_NOT_FOUND, "Resource not found", { uri });
  }
  const code = typeof (err as any)?.getResponseCode === "function" ? (err as any).getResponseCode() : 500;
  if (code >= 400 && code < 500) {
    return new McpError(ErrorCode.InternalError, (err as Error).message);
  }
  useLog("ERROR", "MCP resource operation failed", err);
  return new McpError(ErrorCode.InternalError, "Internal error");
}

/**
 * Create an SDK server wired to Webda operations
 * @param options - registries, session resolution and limits
 * @returns an unconnected SDK Server
 */
export function createMcpServer(options: McpServerOptions): Server {
  const { tools, resources } = options;
  const server = new Server(options.info, {
    capabilities: {
      tools: { listChanged: true },
      ...(resources ? { resources: { listChanged: false, subscribe: false } } : {})
    }
  });
  const allowed = (session: Session, operationId: string) => canCallOperation(sessionContext(session), operationId);

  server.setRequestHandler(ListToolsRequestSchema, async (request, extra) => {
    options.beforeRequest?.();
    const session = options.getSession(extra);
    const visible = tools.list().filter(e => allowed(session, e.operationId));
    const offset = Number(request.params?.cursor ?? 0) || 0;
    const page = visible.slice(offset, offset + TOOLS_PAGE_SIZE);
    const next = offset + TOOLS_PAGE_SIZE < visible.length ? String(offset + TOOLS_PAGE_SIZE) : undefined;
    return { tools: page.map(e => e.tool), ...(next ? { nextCursor: next } : {}) };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    options.beforeRequest?.();
    const session = options.getSession(extra);
    const entry = tools.get(request.params.name);
    if (!entry || !allowed(session, entry.operationId)) {
      throw new McpError(ErrorCode.InvalidParams, `Unknown tool: ${request.params.name}`);
    }
    const args = request.params.arguments ?? {};
    const progressToken = request.params._meta?.progressToken;
    const pending: Promise<unknown>[] = [];
    try {
      const { value, streamed } = await runOperation(entry.operationId, {
        session,
        input: entry.wrapped ? (args as any).value : args,
        signal: extra.signal,
        onChunk:
          progressToken === undefined
            ? undefined
            : (chunk, index) => {
                const total = (chunk as any)?.total;
                const sent = extra
                  .sendNotification({
                    method: "notifications/progress",
                    params: {
                      progressToken,
                      progress: index,
                      ...(typeof total === "number" ? { total } : {}),
                      message: JSON.stringify(chunk)
                    }
                  })
                  .catch(err => useLog("WARN", "MCP progress notification failed", err));
                pending.push(sent);
              }
      });
      await Promise.allSettled(pending);
      return toToolResult(entry, value, streamed, options.maxOutputBytes);
    } catch (err) {
      await Promise.allSettled(pending);
      return errorToToolResult(err);
    }
  });

  if (!resources) {
    return server;
  }

  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
    options.beforeRequest?.();
    return { resourceTemplates: resources.templates() };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request, extra) => {
    options.beforeRequest?.();
    const match = resources.parse(request.params.uri);
    if (!match) {
      throw new McpError(RESOURCE_NOT_FOUND, "Resource not found", { uri: request.params.uri });
    }
    try {
      const { value } = await runOperation(match.model.getOperationId, { session: options.getSession(extra), input: match.key });
      let text = JSON.stringify(value ?? null);
      if (Buffer.byteLength(text) > options.maxOutputBytes) {
        text = `${Buffer.from(text).subarray(0, options.maxOutputBytes).toString()}\n[output truncated]`;
      }
      return { contents: [{ uri: request.params.uri, mimeType: "application/json", text }] };
    } catch (err) {
      throw toResourceError(err, request.params.uri);
    }
  });

  server.setRequestHandler(ListResourcesRequestSchema, async (request, extra) => {
    options.beforeRequest?.();
    const session = options.getSession(extra);
    const listable = resources.models().filter(m => m.queryOperationId && allowed(session, m.queryOperationId));
    const cursor = decodeCursor(request.params?.cursor);
    const index = cursor ? listable.findIndex(m => m.name === cursor.model) : 0;
    if (index < 0) {
      throw new McpError(ErrorCode.InvalidParams, "Invalid cursor");
    }
    if (index >= listable.length) {
      return { resources: [] };
    }
    const model = listable[index];
    let value: unknown;
    try {
      ({ value } = await runOperation(model.queryOperationId, { session, input: { query: queryFor(cursor?.token) } }));
    } catch (err) {
      throw toResourceError(err);
    }
    const result = (value ?? {}) as { results?: Record<string, unknown>[]; continuationToken?: string };
    const items: Resource[] = (result.results ?? []).map(record => ({
      uri: resources.uriFor(model, record),
      name: `${model.name} ${model.pkFields.map(f => String(record[f])).join("/")}`,
      mimeType: "application/json"
    }));
    let nextCursor: string | undefined;
    if (result.continuationToken) {
      nextCursor = encodeCursor({ model: model.name, token: result.continuationToken });
    } else if (index + 1 < listable.length) {
      nextCursor = encodeCursor({ model: listable[index + 1].name });
    }
    return { resources: items, ...(nextCursor ? { nextCursor } : {}) };
  });

  return server;
}
