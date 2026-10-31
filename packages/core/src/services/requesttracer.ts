/**
 * Description of a request entering the framework, given to the registered {@link RequestTracer}
 */
export interface TracedRequest {
  protocol: "http" | "grpc";
  /** HTTP method, or "POST" for gRPC */
  method: string;
  /** Path without query; for gRPC "/pkg.Service/Method" */
  path: string;
  scheme?: "http" | "https";
  /** "1.1" | "2" */
  protocolVersion?: string;
  /** Lowercase header names, HTTP/2 pseudo-headers removed */
  headers: Record<string, string | string[] | undefined>;
  /** Resolved client address (see HttpServer.resolveClientIp) */
  clientIp?: string;
}

/**
 * Handle given to the traced function to report the outcome
 */
export interface RequestTraceHandle {
  /**
   * Report the response status code
   * @param code - the HTTP status code
   */
  setStatus(code: number): void;
}

/**
 * Wraps the processing of a request, e.g. in a tracing span
 */
export interface RequestTracer {
  /**
   * Run `fn` within the trace of the request
   * @param request - the request description
   * @param fn - the processing to trace
   * @returns the result of `fn`
   */
  trace<T>(request: TracedRequest, fn: (handle: RequestTraceHandle) => Promise<T>): Promise<T>;
}

let tracer: RequestTracer | undefined;

const NO_OP_HANDLE: RequestTraceHandle = { setStatus: () => {} };

/**
 * Register the tracer used for every request
 * @param value - the tracer, undefined to remove it
 */
export function registerRequestTracer(value: RequestTracer | undefined): void {
  tracer = value;
}

/**
 * Get the registered tracer
 * @returns the tracer, undefined when none is registered
 */
export function useRequestTracer(): RequestTracer | undefined {
  return tracer;
}

/**
 * Run `fn` under the registered tracer, or directly with a no-op handle when none
 *
 * A failing tracer never breaks the request: if it fails before calling `fn`, `fn` is run directly. Once `fn` was
 * called, its own result or error is returned as is and it is never run twice.
 * @param request - the request description
 * @param fn - the processing to trace
 * @returns the result of `fn`
 */
export async function traceRequest<T>(
  request: TracedRequest,
  fn: (handle: RequestTraceHandle) => Promise<T>
): Promise<T> {
  const current = tracer;
  if (!current) {
    return fn(NO_OP_HANDLE);
  }
  let started = false;
  let outcome: { value: T } | { error: unknown } | undefined;
  const wrapped = async (handle: RequestTraceHandle): Promise<T> => {
    started = true;
    try {
      const value = await fn(handle);
      outcome = { value };
      return value;
    } catch (error) {
      outcome = { error };
      throw error;
    }
  };
  try {
    return await current.trace(request, wrapped);
  } catch (error) {
    if (!started) {
      return fn(NO_OP_HANDLE);
    }
    // fn already ran: surface its own outcome, never re-run it
    if (outcome && "error" in outcome) throw outcome.error;
    if (outcome) return (outcome as { value: T }).value;
    throw error;
  }
}
