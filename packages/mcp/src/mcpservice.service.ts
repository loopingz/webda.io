import {
  Command,
  OperationsTransport,
  OperationsTransportParameters,
  OperationDefinition,
  Session,
  useApplication,
  useService,
  WebContext
} from "@webda/core";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { useLog } from "@webda/workout";
import { randomUUID } from "node:crypto";
import { McpAuthenticator, SessionAuthenticator } from "./auth.js";
import { jsonRpcError, toRequest, writeResponse } from "./bridge.js";
import { ResourceRegistry } from "./resources.js";
import { createMcpServer } from "./server.js";
import { McpSessionEntry, McpSessionManager } from "./sessions.js";
import { operationsFingerprint, ToolRegistry } from "./tools.js";

/**
 * Parameters for the MCP transport
 */
export class McpServiceParameters extends OperationsTransportParameters {
  /**
   * HTTP endpoint; false disables HTTP (stdio only)
   * @default "/mcp"
   */
  url?: string | false;
  /**
   * Models exposed as resources (short ids or "*"); false disables resources
   * @default {"models":["*"]}
   */
  resources?: false | { models?: string[] };
  /**
   * Seconds of inactivity before an MCP session is evicted
   * @default 1800
   */
  sessionTimeout?: number;
  /**
   * Extra Origin values accepted besides the request's own origin
   * @default []
   */
  allowedOrigins?: string[];
  /**
   * Larger tool/resource outputs are truncated
   * @default 1048576
   */
  maxOutputBytes?: number;
  /**
   * Server name announced to clients (defaults to the application package name)
   */
  serverName?: string;
  /**
   * Server version announced to clients (defaults to the application package version)
   */
  serverVersion?: string;
  /**
   * stdio defaults
   */
  stdio?: {
    /**
     * Default user for `webda mcp`
     */
    user?: string;
  };
  /**
   * Name of a service implementing McpAuthenticator; default uses the Webda session
   */
  authenticator?: string;

  /**
   * @param params - raw parameters
   * @returns this with defaults applied
   */
  load(params: any = {}): this {
    super.load(params);
    this.url ??= "/mcp";
    this.resources ??= { models: ["*"] };
    if (this.resources) {
      this.resources.models ??= ["*"];
    }
    this.sessionTimeout ??= 1800;
    this.allowedOrigins ??= [];
    this.maxOutputBytes ??= 1048576;
    this.stdio ??= {};
    return this;
  }
}

/**
 * MCP transport: exposes operations as Model Context Protocol tools and
 * models as resources, over Streamable HTTP (a Webda route) and stdio (`webda mcp`).
 *
 * @WebdaModda
 */
export class McpService<T extends McpServiceParameters = McpServiceParameters> extends OperationsTransport<T> {
  protected tools: ToolRegistry;
  protected resourceRegistry?: ResourceRegistry;
  protected sessions: McpSessionManager;
  protected fingerprint: string = "";
  protected authenticator: McpAuthenticator;
  protected evictTimer?: NodeJS.Timeout;
  protected stdioServers: Server[] = [];

  /**
   * Build typed parameters with defaults. Application replaces this with the
   * webda.module.json `Configuration` class (the same McpServiceParameters);
   * it is defined here so the service also works when registered by hand.
   * @param params - raw parameters
   * @returns typed parameters
   */
  static createConfiguration(params: any = {}): McpServiceParameters {
    return new McpServiceParameters().load(params);
  }

  /**
   * Tools are built in bulk by refreshRegistries
   * @param _operationId - unused
   * @param _definition - unused
   */
  exposeOperation(_operationId: string, _definition: OperationDefinition): void {}

  /**
   * @returns this once the authenticator is resolved
   */
  resolve(): this {
    super.resolve();
    if (this.parameters.authenticator) {
      const service = useService(this.parameters.authenticator as any) as unknown as McpAuthenticator;
      if (typeof service?.authenticate !== "function") {
        throw new Error(`MCP authenticator '${this.parameters.authenticator}' must implement authenticate(ctx)`);
      }
      this.authenticator = service;
    } else {
      this.authenticator = new SessionAuthenticator();
    }
    return this;
  }

  /**
   * Build registries, mount the HTTP route and start session eviction
   * @returns this
   */
  async init(): Promise<this> {
    await super.init();
    const resolve = (name: string) => {
      try {
        return useApplication().getSchema(name) as any;
      } catch {
        return undefined;
      }
    };
    this.tools = new ToolRegistry(resolve);
    this.resourceRegistry = this.parameters.resources
      ? new ResourceRegistry(this.parameters.resources.models)
      : undefined;
    this.sessions = new McpSessionManager(this.parameters.sessionTimeout * 1000);
    this.refreshRegistries();
    if (this.parameters.url !== false) {
      this.addRoute(this.parameters.url, ["GET", "POST", "DELETE"], this.handleHttp, { hidden: true } as any);
    }
    this.evictTimer = setInterval(() => void this.sessions.evictIdle(), 60_000);
    this.evictTimer.unref();
    return this;
  }

  /**
   * Rebuild tool and resource registries when operations changed
   * @returns true when they were rebuilt
   */
  refreshRegistries(): boolean {
    const ops = this.getOperations();
    const fingerprint = operationsFingerprint(ops);
    if (fingerprint === this.fingerprint) {
      return false;
    }
    this.fingerprint = fingerprint;
    this.tools.build(ops);
    this.resourceRegistry?.build(ops);
    return true;
  }

  /**
   * Detect runtime operation registration and notify open sessions
   */
  checkForChanges(): void {
    if (!this.refreshRegistries()) {
      return;
    }
    const servers = [...this.sessions.all().map(e => e.server), ...this.stdioServers];
    for (const server of servers) {
      server.sendToolListChanged().catch(err => useLog("DEBUG", "tools/list_changed not delivered", err));
    }
  }

  /**
   * @param getSession - caller session resolution
   * @returns a new SDK server over this service's registries
   */
  createServer(getSession: (extra: { authInfo?: AuthInfo }) => Session): Server {
    const pkg = useApplication().getPackageDescription?.() || ({} as any);
    return createMcpServer({
      info: {
        name: this.parameters.serverName ?? pkg.name ?? "webda",
        version: this.parameters.serverVersion ?? pkg.version ?? "0.0.0"
      },
      tools: this.tools,
      resources: this.resourceRegistry,
      maxOutputBytes: this.parameters.maxOutputBytes,
      getSession,
      beforeRequest: () => this.checkForChanges()
    });
  }

  /**
   * Handle GET/POST/DELETE on the MCP endpoint
   * @param ctx - the request context
   */
  async handleHttp(ctx: WebContext): Promise<void> {
    const session = await this.authenticator.authenticate(ctx);
    const userId: string | undefined = (session as any)?.userId;
    const http = ctx.getHttpContext();
    const body = http.getMethod() === "POST" ? await ctx.getRawInputAsString() : undefined;
    let parsedBody: unknown;
    if (body) {
      try {
        parsedBody = JSON.parse(body);
      } catch {
        // left undefined: the SDK transport parses the raw body and answers with a parse error
      }
    }
    const sessionId = http.getUniqueHeader("mcp-session-id");
    let entry: McpSessionEntry | undefined;
    if (sessionId) {
      entry = this.sessions.get(sessionId);
      if (!entry) {
        jsonRpcError(ctx, 404, -32001, "Session not found");
        return;
      }
      if (entry.userId !== userId) {
        jsonRpcError(ctx, 403, -32000, "Session belongs to another user");
        return;
      }
    } else {
      const initializing = Array.isArray(parsedBody)
        ? parsedBody.some(m => isInitializeRequest(m))
        : isInitializeRequest(parsedBody);
      if (!initializing && parsedBody !== undefined) {
        jsonRpcError(ctx, 400, -32000, "Bad Request: Mcp-Session-Id header is required");
        return;
      }
      entry = await this.createHttpSession(ctx, userId);
    }
    this.checkForChanges();
    const authInfo: AuthInfo = { token: "", clientId: userId ?? "anonymous", scopes: [], extra: { session } };
    const response = await (entry.transport as WebStandardStreamableHTTPServerTransport).handleRequest(
      toRequest(ctx, body),
      {
        parsedBody,
        authInfo
      }
    );
    await writeResponse(ctx, response);
  }

  /**
   * Create an SDK server + transport pair for a new MCP session
   * @param ctx - the initializing request
   * @param userId - caller user id
   * @returns the (not yet registered) session entry; it registers on initialize
   */
  protected async createHttpSession(ctx: WebContext, userId: string | undefined): Promise<McpSessionEntry> {
    const origin = new URL(ctx.getHttpContext().getAbsoluteUrl()).origin;
    const entry: McpSessionEntry = { id: "", userId, lastSeen: Date.now(), server: undefined, transport: undefined };
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableDnsRebindingProtection: true,
      allowedOrigins: [origin, ...this.parameters.allowedOrigins],
      onsessioninitialized: id => {
        entry.id = id;
        this.sessions.add(entry);
      },
      onsessionclosed: id => this.sessions.remove(id)
    });
    entry.transport = transport;
    entry.server = this.createServer(extra => extra.authInfo?.extra?.session as Session);
    await entry.server.connect(transport);
    return entry;
  }

  /**
   * Stop eviction and close every MCP session
   */
  async stop(): Promise<void> {
    clearInterval(this.evictTimer);
    await this.sessions?.closeAll();
    await Promise.all(this.stdioServers.map(s => s.close().catch(() => {})));
    this.stdioServers = [];
    await super.stop();
  }
}
