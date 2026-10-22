import {
  canCallOperation,
  formatScope,
  probeOperation,
  Session,
  SimpleOperationContext,
  union,
  WebdaError
} from "@webda/core";
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
import { errorToToolResult, runOperation, sessionContext, toToolResult, truncateUtf8 } from "./invoke.js";
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
 * JSON-RPC error code of a tool call refused for insufficient token scope
 */
export const INSUFFICIENT_SCOPE = -32001;

/**
 * Access of a caller to a tool
 *
 * `out_of_scope`: only the bearer token scope refuses it, a wider grant would allow it.
 * `denied`: refused for any other reason (permission, authorizer), as if it did not exist.
 */
export type ToolAccess = "allowed" | "out_of_scope" | "denied";

/**
 * Authorizers stop at the first refusal: a scope refusal may hide another authorizer's refusal. A tool is out of
 * scope only when the caller could call it with the operation added to the token scope.
 * @param context - caller context; authorizers (such as IAM) cache the caller's user on it across a listing
 * @param operationId - operation behind the tool
 * @returns the caller's access to the tool
 */
export async function toolAccess(context: SimpleOperationContext, operationId: string): Promise<ToolAccess> {
  const result = await probeOperation(context, operationId);
  if (result === true) {
    return "allowed";
  }
  if (result !== "insufficient_scope") {
    return "denied";
  }
  // Probe again as if the scope covered the operation, on a view of the session: the real one is left untouched
  const session = context.getSession();
  const widened = Object.create(session) as Session;
  widened.scopes = union(session.scopes ?? [], [operationId]);
  return (await probeOperation(sessionContext(widened), operationId)) === true ? "out_of_scope" : "denied";
}

/**
 * Scope to request for an out-of-scope operation: the current token scope plus the operation
 * @param session - caller session
 * @param operationId - refused operation
 * @returns space-separated scope
 */
export function challengeScope(session: Session | undefined, operationId: string): string {
  return formatScope(union(session?.scopes ?? [], [operationId]));
}

/**
 * @param session - caller session
 * @param operationId - refused operation
 * @returns the insufficient_scope JSON-RPC error
 */
export function insufficientScopeError(session: Session | undefined, operationId: string): McpError {
  return new McpError(INSUFFICIENT_SCOPE, "insufficient_scope", {
    error: "insufficient_scope",
    scope: challengeScope(session, operationId)
  });
}

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
  /**
   * List the tools the token scope does not cover (they are still refused with insufficient_scope)
   */
  listOutOfScopeTools?: boolean;
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
  if (err instanceof WebdaError.CodeError) {
    const code = err.getResponseCode();
    if (code >= 400 && code < 500) {
      return new McpError(ErrorCode.InternalError, err.message);
    }
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
  // One context per request: authorizers (such as IAM) cache the caller's user on it across a listing
  const allowed = (context: SimpleOperationContext, operationId: string): Promise<boolean> =>
    canCallOperation(context, operationId);

  server.setRequestHandler(ListToolsRequestSchema, async (request, extra) => {
    options.beforeRequest?.();
    const session = options.getSession(extra);
    const all = tools.list();
    const context = sessionContext(session);
    const access = await Promise.all(all.map(e => toolAccess(context, e.operationId)));
    const visible = all.filter(
      (_e, i) => access[i] === "allowed" || (options.listOutOfScopeTools && access[i] === "out_of_scope")
    );
    const offset = Number(request.params?.cursor ?? 0) || 0;
    const page = visible.slice(offset, offset + TOOLS_PAGE_SIZE);
    const next = offset + TOOLS_PAGE_SIZE < visible.length ? String(offset + TOOLS_PAGE_SIZE) : undefined;
    return { tools: page.map(e => e.tool), ...(next ? { nextCursor: next } : {}) };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    options.beforeRequest?.();
    const session = options.getSession(extra);
    const entry = tools.get(request.params.name);
    const access = entry ? await toolAccess(sessionContext(session), entry.operationId) : "denied";
    if (access === "out_of_scope") {
      throw insufficientScopeError(session, entry!.operationId);
    }
    if (!entry || access === "denied") {
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

  server.setRequestHandler(ListResourceTemplatesRequestSchema, async (_request, extra) => {
    options.beforeRequest?.();
    // Only advertise models the caller may read, like tools/list
    const context = sessionContext(options.getSession(extra));
    const models = resources.models();
    const flags = await Promise.all(models.map(m => allowed(context, m.getOperationId)));
    return { resourceTemplates: resources.templates(models.filter((_m, i) => flags[i])) };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request, extra) => {
    options.beforeRequest?.();
    const match = resources.parse(request.params.uri);
    if (!match) {
      throw new McpError(RESOURCE_NOT_FOUND, "Resource not found", { uri: request.params.uri });
    }
    try {
      const { value } = await runOperation(match.model.getOperationId, {
        session: options.getSession(extra),
        input: match.key
      });
      const cut = truncateUtf8(JSON.stringify(value ?? null), options.maxOutputBytes);
      const text = cut.truncated
        ? `${cut.text}\n[output truncated: ${cut.bytes} bytes exceeds maxOutputBytes ${options.maxOutputBytes}]`
        : cut.text;
      return { contents: [{ uri: request.params.uri, mimeType: "application/json", text }] };
    } catch (err) {
      throw toResourceError(err, request.params.uri);
    }
  });

  server.setRequestHandler(ListResourcesRequestSchema, async (request, extra) => {
    options.beforeRequest?.();
    const session = options.getSession(extra);
    const models = resources.models();
    const context = sessionContext(session);
    const flags = await Promise.all(
      models.map(m => (m.queryOperationId ? allowed(context, m.queryOperationId) : Promise.resolve(false)))
    );
    const listable = models.filter((_m, i) => flags[i]);
    const cursor = decodeCursor(request.params?.cursor);
    const index = cursor ? listable.findIndex(m => m.name === cursor.model) : 0;
    if (index < 0) {
      throw new McpError(ErrorCode.InvalidParams, "Invalid cursor");
    }
    if (index >= listable.length) {
      return { resources: [] };
    }
    const model = listable[index];
    if (!model.queryOperationId) {
      throw new McpError(ErrorCode.InvalidParams, "Model is not queryable");
    }
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
