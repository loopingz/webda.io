import type { Client as WsClient } from "graphql-ws";
import { SdkError } from "../errors.js";
import type {
  CallContext,
  GraphQLExposure,
  GraphQLLink,
  GraphQLSelection,
  GraphQLSelectionField,
  OperationDescriptor,
  Transport
} from "../types.js";

/** Options of the GraphQL transport */
export interface GraphQLTransportOptions {
  /** URL of the GraphQL endpoint of `GraphQLService` (`https://api.example.com/graphql`) */
  url: string;
  /** URL of the subscriptions WebSocket @default url with ws(s):// */
  wsUrl?: string;
  /** Extra headers per request, e.g. Authorization */
  headers?: () => Record<string, string> | Promise<Record<string, string>>;
  /** fetch implementation @default globalThis.fetch */
  fetch?: typeof fetch;
  /** Credentials mode of the requests @default "include" (cookie session) */
  credentials?: RequestCredentials;
  /** Called once on a `401`; when it resolves to true the request is retried once */
  onUnauthorized?: () => boolean | Promise<boolean>;
  /** WebSocket constructor for the subscriptions @default globalThis.WebSocket */
  webSocket?: unknown;
  /** `connectionParams` of the `graphql-ws` connection (the `GraphQLService` reads the session from the cookies) */
  connectionParams?: Record<string, unknown> | (() => Record<string, unknown> | Promise<Record<string, unknown>>);
}

/** GraphQL error codes of `@webda/graphql` to HTTP-like statuses */
const STATUS_BY_CODE: Record<string, number> = {
  BAD_USER_INPUT: 400,
  GRAPHQL_VALIDATION_FAILED: 400,
  GRAPHQL_PARSE_FAILED: 400,
  OPERATION_REFUSED: 400,
  UNAUTHENTICATED: 401,
  PERMISSION_DENIED: 403,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_OPERATIONS: 429,
  INTERNAL_SERVER_ERROR: 500
};

/** A GraphQL error, as the server formats it */
interface FormattedError {
  message?: string;
  extensions?: { code?: string; [key: string]: unknown };
}

/**
 * @param errors - the errors of a GraphQL response
 * @param body - the whole response
 * @param status - HTTP status of the response, used when the error has no known code: an error without code in a
 * successful response is a document the schema refuses (400)
 * @returns the SdkError of the first error
 */
export function graphqlError(errors: FormattedError[], body: unknown, status: number = 200): SdkError {
  const first = errors[0] ?? {};
  const code = first.extensions?.code !== undefined ? String(first.extensions.code) : undefined;
  const known = code !== undefined ? STATUS_BY_CODE[code] : undefined;
  return new SdkError(known ?? (status >= 400 ? status : code ? 500 : 400), first.message ?? "GraphQL error", {
    code,
    body,
    transport: "graphql"
  });
}

/**
 * Render a selection set
 * @param selection - the selection
 * @returns the GraphQL text, `{ ... }` included
 */
export function renderSelection(selection: GraphQLSelection): string {
  const fields = Object.entries(selection).map(([name, field]) =>
    field !== 1 && field.select ? `${name} ${renderSelection(field.select)}` : name
  );
  return `{ ${fields.join(" ")} }`;
}

/**
 * Narrow a selection to dotted paths (`["name", "owner.name"]`); a relation with sub-fields keeps its target's key
 * and comes back as an object
 * @param selection - the full selection of the operation
 * @param paths - the dotted paths
 * @param keys - fields always kept (the primary key)
 * @returns the projection
 */
export function projectSelection(selection: GraphQLSelection, paths: string[], keys: string[] = []): GraphQLSelection {
  // A query result: the projection applies to its results
  const results = selection.results;
  if (results !== undefined && results !== 1 && results.select && "continuationToken" in selection) {
    return {
      ...selection,
      results: { ...results, select: projectSelection(results.select, paths, keys) }
    };
  }
  const projection: GraphQLSelection = {};
  for (const key of keys) if (selection[key] !== undefined) projection[key] = selection[key];
  // A JSON key may be asked for: find the field renamed from it
  const fieldOf = (sel: GraphQLSelection, name: string): string =>
    Object.entries(sel).find(([, f]) => f !== 1 && f.key === name)?.[0] ?? name;
  for (const path of paths) {
    const parts = path.split(".").filter(Boolean);
    let source: GraphQLSelection | undefined = selection;
    let target = projection;
    parts.forEach((part, index) => {
      const name = source ? fieldOf(source, part) : part;
      const known: 1 | GraphQLSelectionField | undefined = source?.[name];
      const last = index === parts.length - 1;
      if (last) {
        // A relation or an object asked whole keeps its default selection
        target[name] ??= known ?? 1;
        return;
      }
      const field: GraphQLSelectionField = known && known !== 1 ? known : {};
      const current = target[name];
      const next: GraphQLSelectionField =
        current && current !== 1
          ? current
          : {
              ...field,
              // A relation asked with sub-fields: its key plus the sub-fields, the object is kept
              select: field.link ? { ...field.select } : {},
              ...(field.link ? { link: { ...field.link, as: "ref" as const } } : {})
            };
      target[name] = next;
      source = field.link ? undefined : field.select;
      target = next.select!;
    });
  }
  return projection;
}

/**
 * @param value - a relation value
 * @param link - how to reshape it
 * @returns the uid of the target
 */
function uidOf(value: any, link: GraphQLLink): string | undefined {
  if (value === null || typeof value !== "object") return value ?? undefined;
  return link.pk.map(key => String(value[key])).join(link.separator ?? "_");
}

/**
 * Turn a GraphQL result back into what the REST API sends: JSON keys, relations as uids or references
 * @param value - the value
 * @param selection - its selection
 * @returns the reshaped value
 */
export function reshape(value: unknown, selection: GraphQLSelection | undefined): unknown {
  if (value === null || value === undefined || !selection || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(item => reshape(item, selection));
  const result: Record<string, unknown> = {};
  for (const [name, raw] of Object.entries(value as Record<string, unknown>)) {
    const field = selection[name];
    if (field === undefined || field === 1) {
      result[name] = raw;
      continue;
    }
    let data = field.select ? reshape(raw, field.select) : raw;
    const link = field.link;
    if (link && data !== null && data !== undefined) {
      if (link.as === "id") {
        data = Array.isArray(data)
          ? data.map(item => uidOf(item, link)).filter(uid => uid !== undefined)
          : uidOf(data, link);
      } else if (link.as === "map" && Array.isArray(data)) {
        data = Object.fromEntries(data.filter(Boolean).map(item => [uidOf(item, link), item]));
      }
    }
    result[field.key ?? name] = data;
  }
  return result;
}

/**
 * Transport over the schema of `Webda/GraphQLService`
 *
 * Queries and mutations are sent with `fetch` (`POST` JSON), server-streaming operations are subscriptions over
 * `graphql-ws` (an optional peer dependency, imported on the first subscription). Selection sets come from the
 * manifest: every attribute the server sends, relations reshaped to the uids the REST API sends, so the results
 * normalize into the cache the same way; `{ select: ["name", "owner.name"] }` narrows them to a projection.
 */
export class GraphQLTransport implements Transport {
  readonly name = "graphql";
  protected ws?: Promise<WsClient>;

  /**
   * @param options - transport options
   */
  constructor(protected options: GraphQLTransportOptions) {}

  /**
   * @param op - the operation
   * @returns true when the GraphQL schema exposes it
   */
  supports(op: OperationDescriptor): boolean {
    return op.graphql !== undefined && (op.streaming === "none" || op.streaming === "server");
  }

  /**
   * The document and variables of a call
   * @param op - the operation
   * @param input - the input
   * @param ctx - the call context
   * @returns the request
   */
  prepare(
    op: OperationDescriptor,
    input: unknown,
    ctx: CallContext = {}
  ): { query: string; variables: Record<string, unknown>; selection?: GraphQLSelection } {
    const graphql = op.graphql as GraphQLExposure;
    const data: Record<string, unknown> =
      input !== null && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
    const args = Object.entries(graphql.args ?? {});
    const variables: Record<string, unknown> = {};
    for (const [name] of args) {
      if (graphql.wrap?.arg === name) {
        const fields = graphql.wrap.fields;
        variables[name] = fields
          ? Object.fromEntries(
              Object.entries(fields)
                .filter(([, key]) => data[key] !== undefined)
                .map(([field, key]) => [field, data[key]])
            )
          : input;
      } else if (data[name] !== undefined) {
        variables[name] = data[name];
      }
    }
    const selection =
      graphql.selection && ctx.select?.length
        ? projectSelection(graphql.selection, ctx.select, graphql.keys)
        : graphql.selection;
    const declarations = args.length ? `(${args.map(([name, type]) => `$${name}: ${type}`).join(", ")})` : "";
    const call = args.length ? `(${args.map(([name]) => `${name}: $${name}`).join(", ")})` : "";
    const operationName = `Sdk_${op.id.replace(/[^_0-9A-Za-z]/g, "_")}`;
    const query = `${graphql.kind} ${operationName}${declarations} { ${graphql.name}${call}${
      selection ? ` ${renderSelection(selection)}` : ""
    } }`;
    return { query, variables, selection };
  }

  /**
   * POST a GraphQL request, retrying once after `onUnauthorized`
   * @param body - the request
   * @param body.query - the GraphQL document
   * @param body.variables - its variables
   * @param ctx - the call context
   * @param retried - this is the retry
   * @returns the response
   */
  protected async send(
    body: { query: string; variables: Record<string, unknown> },
    ctx: CallContext,
    retried: boolean = false
  ): Promise<Response> {
    const doFetch = this.options.fetch ?? globalThis.fetch;
    let response: Response;
    try {
      response = await doFetch(this.options.url, {
        method: "POST",
        credentials: this.options.credentials ?? "include",
        signal: ctx.signal,
        headers: {
          Accept: "application/graphql-response+json, application/json",
          "Content-Type": "application/json",
          ...(await this.options.headers?.()),
          ...ctx.headers
        },
        body: JSON.stringify(body)
      });
    } catch (err) {
      throw new SdkError(0, (err as Error)?.message ?? "Network error", { transport: this.name, cause: err });
    }
    if (response.status === 401 && this.options.onUnauthorized && !retried && (await this.options.onUnauthorized())) {
      return this.send(body, ctx, true);
    }
    return response;
  }

  /**
   * @param op - the operation
   * @param input - the input
   * @param ctx - the call context
   * @returns the result of the field, reshaped; the chunks of a subscription
   */
  async call(op: OperationDescriptor, input: unknown, ctx: CallContext): Promise<unknown> {
    if (op.graphql?.kind === "subscription") {
      const chunks: unknown[] = [];
      for await (const chunk of this.stream(op, input, ctx)) chunks.push(chunk);
      return chunks;
    }
    const { query, variables, selection } = this.prepare(op, input, ctx);
    const response = await this.send({ query, variables }, ctx);
    const text = await response.text().catch(() => "");
    let body: any;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      throw new SdkError(response.ok ? 500 : response.status, text || response.statusText, {
        body: text,
        transport: this.name
      });
    }
    if (body?.errors?.length) throw graphqlError(body.errors, body, response.status);
    if (!response.ok) {
      throw new SdkError(response.status, response.statusText || `HTTP ${response.status}`, {
        body,
        transport: this.name
      });
    }
    return reshape(body?.data?.[op.graphql!.name], selection) ?? undefined;
  }

  /**
   * @returns the `graphql-ws` client, created on the first subscription
   */
  protected client(): Promise<WsClient> {
    this.ws ??= (async () => {
      const { createClient } = await import("graphql-ws");
      const url = this.options.wsUrl ?? this.options.url.replace(/^http/, "ws");
      return createClient({
        url,
        lazy: true,
        ...(this.options.webSocket ? { webSocketImpl: this.options.webSocket } : {}),
        ...(this.options.connectionParams ? { connectionParams: this.options.connectionParams } : {})
      });
    })();
    return this.ws;
  }

  /**
   * A subscription, over `graphql-ws`
   * @param op - the operation
   * @param input - the input
   * @param ctx - the call context
   * @returns the chunks, reshaped
   */
  async *stream(op: OperationDescriptor, input: unknown, ctx: CallContext): AsyncIterable<unknown> {
    if (op.graphql?.kind !== "subscription") {
      // A query or a mutation: one chunk
      yield await this.call(op, input, ctx);
      return;
    }
    const { query, variables, selection } = this.prepare(op, input, ctx);
    let client: WsClient;
    try {
      client = await this.client();
    } catch (err) {
      throw new SdkError(0, `graphql-ws is required for GraphQL subscriptions: ${(err as Error)?.message}`, {
        transport: this.name,
        cause: err
      });
    }
    const iterator = client.iterate({ query, variables });
    const abort = () => void iterator.return?.();
    ctx.signal?.addEventListener("abort", abort);
    try {
      while (true) {
        let next: IteratorResult<any>;
        try {
          next = await iterator.next();
        } catch (err) {
          throw this.socketError(err);
        }
        if (next.done) return;
        const result = next.value;
        if (result?.errors?.length) throw graphqlError(result.errors, result);
        yield reshape(result?.data?.[op.graphql.name], selection);
      }
    } finally {
      ctx.signal?.removeEventListener("abort", abort);
      await iterator.return?.();
    }
  }

  /**
   * @param err - what `graphql-ws` threw: GraphQL errors, a close event or an error
   * @returns the SdkError
   */
  protected socketError(err: unknown): SdkError {
    if (Array.isArray(err)) return graphqlError(err, err);
    if (err instanceof SdkError) return err;
    const close = err as { code?: number; reason?: string; message?: string };
    if (typeof close?.code === "number") {
      return new SdkError(close.code === 4403 ? 403 : close.code === 4401 ? 401 : 0, close.reason || "Socket closed", {
        code: String(close.code),
        transport: this.name,
        cause: err
      });
    }
    return new SdkError(0, close?.message ?? "Socket error", { transport: this.name, cause: err });
  }

  /**
   * Close the subscriptions socket
   */
  async close(): Promise<void> {
    const ws = this.ws;
    this.ws = undefined;
    if (ws) await (await ws).dispose();
  }
}
