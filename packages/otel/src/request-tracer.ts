import {
  type Attributes,
  type Context,
  type Histogram,
  type Link,
  type Span,
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  context,
  createContextKey,
  isSpanContextValid,
  metrics,
  propagation,
  trace
} from "@opentelemetry/api";
import { tracing } from "@opentelemetry/sdk-node";
import { type RequestTraceHandle, type RequestTracer, type TracedRequest, createSubnetChecker } from "@webda/core";
import type { OtelService } from "./otel.service.js";

/**
 * Baggage entry and span attribute carrying the tracing session
 */
export const SESSION_ID = "session.id";

/**
 * Header carrying the trace token. It is read here only and never propagated
 */
const TRACE_TOKEN_HEADER = "x-webda-trace";

/**
 * Longer values cannot be a trace token: they are ignored without verification
 */
const MAX_TOKEN_LENGTH = 4096;

/**
 * Context key asking {@link ForceableRootSampler} to sample the new root span of a trace token request
 */
const FORCE_SAMPLING = createContextKey("webda.otel.forceSampling");

/**
 * Methods reported as is, any other one is reported as `_OTHER` (semantic conventions, bounded cardinality)
 */
const KNOWN_METHODS = new Set(["CONNECT", "DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT", "TRACE"]);

/**
 * Root sampler of the `ParentBased` sampler: samples the root span of a trace token request, delegates otherwise
 *
 * Only {@link OtelRequestTracer} sets the context key, after verifying the token: no header can force it.
 */
export class ForceableRootSampler implements tracing.Sampler {
  /**
   * @param delegate - the sampler used for every other root span
   */
  constructor(protected delegate: tracing.Sampler) {}

  /**
   * Sample when the context asks for it, else ask the delegate
   * @param ctx - the parent context
   * @param traceId - the trace id
   * @param spanName - the span name
   * @param spanKind - the span kind
   * @param attributes - the span attributes
   * @param links - the span links
   * @returns the sampling decision
   */
  shouldSample(
    ctx: Context,
    traceId: string,
    spanName: string,
    spanKind: SpanKind,
    attributes: Attributes,
    links: Link[]
  ): tracing.SamplingResult {
    if (ctx.getValue(FORCE_SAMPLING) === true) {
      return { decision: tracing.SamplingDecision.RECORD_AND_SAMPLED };
    }
    return this.delegate.shouldSample(ctx, traceId, spanName, spanKind, attributes, links);
  }

  /**
   * @returns the sampler description
   */
  toString(): string {
    return `ForceableRootSampler{${this.delegate.toString()}}`;
  }
}

/**
 * Copy the `session.id` baggage entry of the context to every span started in it
 */
export class SessionIdSpanProcessor implements tracing.SpanProcessor {
  /**
   * Set the `session.id` attribute from the baggage
   * @param span - the span starting
   * @param parentContext - the context it starts in
   */
  onStart(span: tracing.Span, parentContext: Context): void {
    const sessionId = propagation.getBaggage(parentContext)?.getEntry(SESSION_ID)?.value;
    if (sessionId) {
      span.setAttribute(SESSION_ID, sessionId);
    }
  }

  /**
   * Nothing to do
   * @param _span - the span ending
   */
  onEnd(_span: tracing.ReadableSpan): void {}

  /**
   * Nothing to flush
   */
  async forceFlush(): Promise<void> {}

  /**
   * Nothing to release
   */
  async shutdown(): Promise<void> {}
}

/**
 * Trace every request entering Webda (HTTP/1.1, HTTP/2, gRPC...) in a server span
 *
 * The incoming `traceparent` and `baggage` are honored only for a trusted source or a valid trace token, see
 * {@link OtelRequestTracer.decide}. The server duration metric is recorded for every request, traced or not.
 */
export class OtelRequestTracer implements RequestTracer {
  protected tracer = trace.getTracer("@webda/otel");
  protected isTrustedSource: (ip: string) => boolean;
  protected httpDuration: Histogram;
  protected rpcDuration: Histogram;

  /**
   * @param service - the service holding the configuration and verifying the tokens
   */
  constructor(protected service: OtelService) {
    this.isTrustedSource = createSubnetChecker(service.getParameters().trustedTraceSources ?? []);
    const meter = metrics.getMeter("@webda/otel");
    this.httpDuration = meter.createHistogram("http.server.request.duration", {
      description: "Duration of HTTP server requests",
      unit: "s"
    });
    this.rpcDuration = meter.createHistogram("rpc.server.duration", {
      description: "Duration of RPC server requests",
      unit: "ms"
    });
  }

  /**
   * Decide how much of the incoming trace context to honor
   *
   * - `trusted`: the client address is in `trustedTraceSources`: `traceparent` and `baggage` are honored
   * - `token`: a valid `X-Webda-Trace` token: `traceparent` and `baggage` are honored, `session.id` is the token `sid`
   * - `ignore`: anything else, including an invalid or expired token: the incoming context is dropped
   * @param request - the request
   * @returns the mode, with the token session id for `token`
   */
  async decide(request: TracedRequest): Promise<{ mode: "trusted" | "token" | "ignore"; sid?: string }> {
    if (request.clientIp && this.isTrustedSource(request.clientIp)) {
      return { mode: "trusted" };
    }
    const header = request.headers?.[TRACE_TOKEN_HEADER];
    const token = Array.isArray(header) ? header[0] : header;
    if (typeof token === "string" && token.length > 0 && token.length <= MAX_TOKEN_LENGTH) {
      const claims = await this.service.verifyTraceToken(token);
      if (claims) {
        return { mode: "token", sid: claims.sid };
      }
      this.service.log("DEBUG", "Ignoring an invalid or expired trace token");
    }
    return { mode: "ignore" };
  }

  /**
   * Build the context the server span starts in
   * @param request - the request
   * @param decision - the result of {@link decide}
   * @param decision.mode - how much of the incoming context to honor
   * @param decision.sid - the token session id
   * @returns the parent context
   */
  protected parentContext(request: TracedRequest, decision: { mode: string; sid?: string }): Context {
    if (decision.mode === "ignore") {
      return ROOT_CONTEXT;
    }
    let ctx = propagation.extract(ROOT_CONTEXT, request.headers);
    if (decision.mode === "token" && decision.sid) {
      const baggage = (propagation.getBaggage(ctx) ?? propagation.createBaggage()).setEntry(SESSION_ID, {
        value: decision.sid
      });
      ctx = propagation.setBaggage(ctx, baggage);
      // No usable parent: the token still asks for this request to be recorded
      const remote = trace.getSpanContext(ctx);
      if (!remote || !isSpanContextValid(remote)) {
        ctx = ctx.setValue(FORCE_SAMPLING, true);
      }
    }
    return ctx;
  }

  /**
   * Start the server span of the request
   * @param request - the request
   * @returns the span and the context to run the request in
   */
  protected async start(request: TracedRequest): Promise<{ span: Span; ctx: Context }> {
    const parent = this.parentContext(request, await this.decide(request));
    const span = this.tracer.startSpan(
      this.spanName(request),
      { kind: SpanKind.SERVER, attributes: this.requestAttributes(request) },
      parent
    );
    // The forced sampling applies to this root span only
    return { span, ctx: trace.setSpan(parent.deleteValue(FORCE_SAMPLING), span) };
  }

  /**
   * @param request - the request
   * @returns `{method} {path}` for HTTP, `{service}/{method}` for gRPC
   */
  protected spanName(request: TracedRequest): string {
    if (request.protocol === "grpc") {
      return request.path.replace(/^\//, "");
    }
    return `${this.method(request)} ${request.path || "/"}`;
  }

  /**
   * @param request - the request
   * @returns the HTTP method, `_OTHER` when unknown
   */
  protected method(request: TracedRequest): string {
    const method = (request.method ?? "").toUpperCase();
    return KNOWN_METHODS.has(method) ? method : "_OTHER";
  }

  /**
   * @param request - the gRPC request
   * @returns the RPC service and method from `/pkg.Service/Method`
   */
  protected rpc(request: TracedRequest): { service: string; method: string } {
    const path = request.path.replace(/^\//, "");
    const index = path.lastIndexOf("/");
    return index < 0
      ? { service: "", method: path }
      : { service: path.substring(0, index), method: path.substring(index + 1) };
  }

  /**
   * @param request - the request
   * @returns the network protocol version, `2` for HTTP/2
   */
  protected protocolVersion(request: TracedRequest): string | undefined {
    return request.protocolVersion === "2.0" ? "2" : request.protocolVersion;
  }

  /**
   * Attributes shared by the span and the duration metric
   * @param request - the request
   * @param status - the response status, if known
   * @returns the attributes
   */
  protected metricAttributes(request: TracedRequest, status?: number): Attributes {
    if (request.protocol === "grpc") {
      const { service, method } = this.rpc(request);
      return {
        "rpc.system": "grpc",
        "rpc.service": service,
        "rpc.method": method,
        ...(status !== undefined ? { "rpc.grpc.status_code": status } : {})
      };
    }
    return {
      "http.request.method": this.method(request),
      ...(status !== undefined ? { "http.response.status_code": status } : {}),
      ...(request.scheme ? { "url.scheme": request.scheme } : {}),
      ...(this.protocolVersion(request) ? { "network.protocol.version": this.protocolVersion(request) } : {})
    };
  }

  /**
   * @param request - the request
   * @returns the span attributes known when the request starts
   */
  protected requestAttributes(request: TracedRequest): Attributes {
    return {
      ...this.metricAttributes(request),
      ...(request.protocol === "http" ? { "url.path": request.path } : {}),
      ...(request.clientIp ? { "client.address": request.clientIp } : {})
    };
  }

  /**
   * @param request - the request
   * @param status - the response status
   * @returns true when the status is a server error (5xx, or a non-zero gRPC status)
   */
  protected isError(request: TracedRequest, status?: number): boolean {
    if (status === undefined) return false;
    return request.protocol === "grpc" ? status !== 0 : status >= 500;
  }

  /**
   * End the span and record the duration
   * @param request - the request
   * @param span - the server span, undefined when it could not start
   * @param started - `performance.now()` when the request started
   * @param status - the response status
   * @param error - the error thrown by the request, if any
   */
  protected finish(request: TracedRequest, span: Span | undefined, started: number, status?: number, error?: unknown) {
    const elapsed = performance.now() - started;
    const attributes = this.metricAttributes(request, status);
    if (error !== undefined) {
      attributes["error.type"] = (error as Error)?.constructor?.name || "_OTHER";
    }
    if (span) {
      span.setAttributes(attributes);
      if (error !== undefined) {
        span.recordException(error instanceof Error ? error : String(error));
        span.setStatus({ code: SpanStatusCode.ERROR, message: error instanceof Error ? error.message : undefined });
      } else if (this.isError(request, status)) {
        span.setStatus({ code: SpanStatusCode.ERROR });
      }
      span.end();
    }
    if (request.protocol === "grpc") {
      this.rpcDuration.record(elapsed, attributes);
    } else {
      this.httpDuration.record(elapsed / 1000, attributes);
    }
  }

  /**
   * Run the request in its server span
   *
   * Tracing failures never break the request: `fn` always runs, once.
   * @param request - the request
   * @param fn - the request processing
   * @returns the result of `fn`
   */
  async trace<T>(request: TracedRequest, fn: (handle: RequestTraceHandle) => Promise<T>): Promise<T> {
    const started = performance.now();
    let status: number | undefined;
    const handle: RequestTraceHandle = {
      setStatus: (code: number) => {
        status = code;
      }
    };
    let span: Span | undefined;
    let ctx: Context = ROOT_CONTEXT;
    try {
      ({ span, ctx } = await this.start(request));
    } catch (err) {
      this.service.log("WARN", "Cannot start the request span", err);
    }
    let error: unknown;
    try {
      return await context.with(ctx, () => fn(handle));
    } catch (err) {
      error = err ?? new Error("Unknown error");
      throw err;
    } finally {
      try {
        this.finish(request, span, started, status, error);
      } catch (err) {
        this.service.log("WARN", "Cannot record the request span", err);
      }
    }
  }
}
