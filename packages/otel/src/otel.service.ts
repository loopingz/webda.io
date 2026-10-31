import { DiagLogLevel, diag, trace } from "@opentelemetry/api";
import { Logger as OtelLibLogger } from "@opentelemetry/api-logs";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import type { Instrumentation } from "@opentelemetry/instrumentation";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-grpc";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor, LogRecordExporter, LoggerProvider } from "@opentelemetry/sdk-logs";
import { ConsoleMetricExporter, type MetricReader, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK, tracing } from "@opentelemetry/sdk-node";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import {
  type Context,
  Operation,
  SecretString,
  Service,
  ServiceParameters,
  WebContext,
  WebdaError,
  registerRequestTracer,
  useApplication,
  useContext,
  useCore,
  useCrypto,
  useRequestTracer,
  useRouter
} from "@webda/core";
import { randomUUID } from "node:crypto";
import { WorkerLogger, WorkerMessage, WorkerOutput } from "@webda/workout";
import { ForceableRootSampler, OtelRequestTracer, SessionIdSpanProcessor } from "./request-tracer.js";

/**
 * Audience of the web tracing tokens: a token of another audience is never accepted
 */
const TRACE_TOKEN_AUDIENCE = "webda-trace";

/**
 * Forward WorkerOutput log messages to an OpenTelemetry logger
 */
export class OtelLogger extends WorkerLogger {
  /**
   * @param logger - the OpenTelemetry logger to emit to
   * @param output - the WorkerOutput to listen to
   */
  constructor(
    protected logger: OtelLibLogger,
    output: WorkerOutput
  ) {
    super(output);
  }

  /**
   * Emit log messages as OpenTelemetry log records
   * @param msg - the worker message
   */
  onMessage(msg: WorkerMessage) {
    if (msg.type !== "log" || !msg.log) {
      return;
    }
    this.logger.emit({
      severityText: msg.log.level,
      body: msg.log.args.join(" ")
    });
  }
}

/**
 * OpenTelemetry service parameters
 */
export class OtelServiceParameters extends ServiceParameters {
  /**
   * Trace export configuration
   * @default {"type":"otlp","enable":true,"sampling":0.01}
   */
  traceExporter: {
    type: "console" | "otlp";
    /**
     * Allow to disable the trace exporter
     * @default true
     */
    enable?: boolean;
    /**
     * Between 0.0 and 1.0
     *
     * @default 0.01
     */
    sampling: number;
  };
  metricExporter?: {
    type: "console" | "otlp";
    /**
     * Allow to disable the metric exporter
     * @default true
     */
    enable?: boolean;
  };
  /**
   * Logger export
   * If empty it is disabled
   *
   * Values (url, headers...) can be encrypted with `webda config encrypt`
   */
  loggerExporter?: {
    /**
     * Allow to disable the logger
     * @default true
     */
    enable?: boolean;
    type?: "otlp";
    /**
     * Can be encrypted with `webda config encrypt` (when it holds credentials)
     *
     * @default http://localhost:4317
     */
    url?: string | SecretString;
  };
  /**
   * @default NONE
   */
  diagnostic?: "NONE" | "ERROR" | "WARN" | "INFO" | "DEBUG" | "TRACE" | "ALL";
  /**
   * Service name reported to OpenTelemetry, default to the package name
   */
  name?: string;
  /**
   * On-demand web tracing: an authorized user gets a short-lived token, the browser sends it as
   * `X-Webda-Trace` to have its `traceparent` and `baggage` honored
   */
  webTracing?: {
    /**
     * Emails allowed to enable web tracing, as regular expressions matching the whole email
     * (`"*"` means any authenticated user). Empty or missing means nobody.
     */
    allowedEmails?: string[];
    /**
     * Token lifetime in seconds
     *
     * @default 900
     */
    duration?: number;
  };
  /**
   * Sources (IP or CIDR) whose `traceparent` and `baggage` are always honored
   *
   * @default []
   */
  trustedTraceSources?: string[];

  /**
   * Apply default values
   * @param params - the service parameters
   * @returns this
   */
  load(params: any = {}): this {
    super.load(params);
    this.traceExporter ??= {
      type: "otlp",
      enable: true,
      sampling: 0.01
    };
    this.traceExporter.sampling ??= 0.01;
    this.metricExporter ??= {
      type: "otlp",
      enable: true
    };
    this.loggerExporter ??= {
      enable: true,
      type: "otlp",
      url: "http://localhost:4317"
    };
    this.diagnostic ??= "NONE";
    this.webTracing ??= {};
    this.webTracing.allowedEmails ??= [];
    this.webTracing.duration ??= 900;
    this.trustedTraceSources ??= [];
    return this;
  }
}

/**
 * Otel Service
 *
 * Start the OpenTelemetry NodeSDK, forward the logs and add a span
 * for each request (see {@link OtelRequestTracer}) and each service method call
 *
 * @WebdaModda
 */
export class OtelService<T extends OtelServiceParameters = OtelServiceParameters> extends Service<T> {
  sdk: NodeSDK;
  stubs?: Map<
    object,
    {
      [key: string]: Function;
    }
  >;
  otelLogger: OtelLogger;
  loggerExporter: LogRecordExporter;
  loggerProvider: LoggerProvider;
  requestTracer?: OtelRequestTracer;
  instrumentations?: Instrumentation[];

  /**
   * Stop otlp
   */
  async stop() {
    if (this.requestTracer && useRequestTracer() === this.requestTracer) {
      registerRequestTracer(undefined);
    }
    this.unpatch();
    // The SDK shutdown leaves the instrumentations enabled
    this.instrumentations?.forEach(instrumentation => instrumentation.disable());
    this.otelLogger?.close();
    await Promise.all([super.stop(), this.loggerProvider?.shutdown(), this.sdk?.shutdown()]);
  }

  /**
   * Get diag level based on parameters
   * @returns the OpenTelemetry diagnostic level
   */
  getDiagLevel() {
    let diagLevel = DiagLogLevel.NONE;
    if (this.parameters.diagnostic === "DEBUG") {
      diagLevel = DiagLogLevel.DEBUG;
    } else if (this.parameters.diagnostic === "ERROR") {
      diagLevel = DiagLogLevel.ERROR;
    } else if (this.parameters.diagnostic === "INFO") {
      diagLevel = DiagLogLevel.INFO;
    } else if (this.parameters.diagnostic === "TRACE") {
      diagLevel = DiagLogLevel.VERBOSE;
    } else if (this.parameters.diagnostic === "WARN") {
      diagLevel = DiagLogLevel.WARN;
    } else if (this.parameters.diagnostic === "ALL") {
      diagLevel = DiagLogLevel.ALL;
    }
    return diagLevel;
  }

  /**
   * Start the SDK as early as possible so instrumentations are in place
   * @returns this
   */
  resolve(): this {
    super.resolve();

    this.log("INFO", "Start otel");
    const pkgInfo = useApplication().getPackageDescription();

    // Route OpenTelemetry diagnostics to our logger
    diag.setLogger(
      {
        verbose: (message: string) => this.log("TRACE", message),
        debug: (message: string) => this.log("DEBUG", message),
        error: (message: string) => this.log("ERROR", message),
        warn: (message: string) => this.log("WARN", message),
        info: (message: string) => this.log("INFO", message)
      },
      this.getDiagLevel()
    );

    const resource = resourceFromAttributes({
      [ATTR_SERVICE_NAME]: this.parameters.name || pkgInfo.name,
      [ATTR_SERVICE_VERSION]: pkgInfo.version
    });

    // Logger part
    if (this.parameters.loggerExporter?.enable !== false) {
      this.loggerExporter ??= new OTLPLogExporter(
        // Encrypted values are unwrapped to plain strings for the exporter
        SecretString.unwrap({ ...this.parameters.loggerExporter }) as any
      );
      this.loggerProvider ??= new LoggerProvider({
        resource,
        processors: [new BatchLogRecordProcessor({ exporter: this.loggerExporter })]
      });
      this.otelLogger ??= new OtelLogger(this.loggerProvider.getLogger("webda"), useApplication().getWorkerOutput());
    }
    // Webda starts the server spans itself, after deciding whether to trust the incoming trace context
    this.instrumentations ??= getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-http": { ignoreIncomingRequestHook: () => true }
    });
    this.sdk ??= new NodeSDK({
      resource,
      spanProcessors: this.getSpanProcessors(),
      // Honor the sampling decision of a (verified) remote parent, sample the roots by ratio
      // unless a trace token asks for the request to be recorded
      sampler: new tracing.ParentBasedSampler({
        root: new ForceableRootSampler(new tracing.TraceIdRatioBasedSampler(this.parameters.traceExporter.sampling))
      }),
      metricReaders: this.getMetricReaders(),
      instrumentations: this.instrumentations
    });

    this.sdk.start();
    this.requestTracer = new OtelRequestTracer(this);
    registerRequestTracer(this.requestTracer);
    useRouter()?.addCorsAllowedHeaders("traceparent", "tracestate", "baggage", "X-Webda-Trace");
    this.updatePatch();
    return this;
  }

  /**
   * Span processors of the SDK: `session.id` attribute then export
   * @returns the processors, empty when the trace exporter is disabled
   */
  protected getSpanProcessors(): tracing.SpanProcessor[] {
    const exporter = this.getTraceExporter();
    return exporter ? [new SessionIdSpanProcessor(), new tracing.BatchSpanProcessor(exporter)] : [];
  }

  /**
   * Metric readers of the SDK
   * @returns the readers, undefined when the metric exporter is disabled
   */
  protected getMetricReaders(): MetricReader[] | undefined {
    if (this.parameters.metricExporter?.enable === false) {
      return undefined;
    }
    return [
      new PeriodicExportingMetricReader({
        exporter:
          this.parameters.metricExporter?.type === "console" ? new ConsoleMetricExporter() : new OTLPMetricExporter()
      })
    ];
  }

  /**
   * Check whether the caller can enable web tracing
   *
   * Anonymous callers are refused. Override to change the policy.
   * @param context - the caller context
   * @returns true if allowed
   */
  protected async canEnableWebTracing(context: Context): Promise<boolean> {
    const allowed = this.parameters.webTracing?.allowedEmails ?? [];
    if (!allowed.length || !context.getCurrentUserId()) {
      return false;
    }
    if (allowed.includes("*")) {
      return true;
    }
    const email = (await context.getCurrentUser())?.getEmail?.();
    if (!email) {
      return false;
    }
    return allowed.some(pattern => {
      try {
        return new RegExp(`^(?:${pattern})$`).test(email);
      } catch {
        this.log("WARN", `Invalid web tracing allowedEmails pattern ${pattern}`);
        return false;
      }
    });
  }

  /**
   * Enable web tracing for the current user
   *
   * @param sessionId - the tracing session to join, generated when omitted
   * @returns the trace token to send as `X-Webda-Trace` and its expiration
   * @throws WebdaError.Forbidden when the caller is not allowed
   */
  @Operation({
    id: "Otel.EnableWebTracing",
    rest: { method: "post", path: "otel/tracing" },
    graphql: false,
    grpc: false,
    mcp: false
  })
  async enableWebTracing(sessionId?: string): Promise<{ token: string; sessionId: string; expiresAt: number }> {
    const ctx = useContext();
    if (!(await this.canEnableWebTracing(ctx))) {
      throw new WebdaError.Forbidden("Web tracing is not allowed");
    }
    sessionId = sessionId || randomUUID();
    const duration = this.parameters.webTracing?.duration ?? 900;
    // The uid claim is for logs only, never the session userId
    const token = await useCrypto().jwtSign(
      { sid: sessionId, uid: ctx.getCurrentUserId() },
      { audience: TRACE_TOKEN_AUDIENCE, expiresIn: duration }
    );
    return { token, sessionId, expiresAt: Date.now() + duration * 1000 };
  }

  /**
   * Verify a trace token
   * @param token - the `X-Webda-Trace` value
   * @returns the claims or undefined when the token is invalid, expired or not a trace token
   */
  async verifyTraceToken(token: string): Promise<{ sid: string; uid: string } | undefined> {
    try {
      const claims = await useCrypto().jwtVerify(token, { audience: TRACE_TOKEN_AUDIENCE });
      if (typeof claims?.sid !== "string") {
        return undefined;
      }
      return { sid: claims.sid, uid: claims.uid };
    } catch {
      return undefined;
    }
  }

  /**
   * Create the trace exporter based on parameters
   * @returns the trace exporter or undefined if disabled
   */
  getTraceExporter(): tracing.SpanExporter | undefined {
    if (this.parameters.traceExporter?.enable === false) {
      return undefined;
    }
    return this.parameters.traceExporter?.type === "console"
      ? new tracing.ConsoleSpanExporter()
      : new OTLPTraceExporter();
  }

  /**
   * Patch or unpatch the services depending on the trace exporter configuration
   * @returns this
   */
  updatePatch(): this {
    if (this.parameters.traceExporter?.enable !== false) {
      this.patch();
    } else {
      this.unpatch();
    }
    return this;
  }

  /**
   * Remove patched methods
   */
  unpatch() {
    if (!this.stubs) return;
    for (const [object, methods] of this.stubs) {
      for (const [method, original] of Object.entries(methods)) {
        Reflect.set(object, method, original);
      }
    }
    this.stubs = undefined;
  }

  /**
   * Wrap a method
   * @param object - the object owning the method
   * @param method - the method name
   * @param wrapper - return the replacement from the bound original
   */
  protected _wrap(object: object, method: string, wrapper: Function) {
    const original: unknown = Reflect.get(object, method);
    if (typeof original !== "function") return;
    this.stubs ??= new Map();
    const objectStubs = this.stubs.get(object) ?? {};
    this.stubs.set(object, objectStubs);
    // Already patched
    if (objectStubs[method]) return;
    try {
      if (!Reflect.set(object, method, wrapper(original.bind(object)))) {
        diag.debug(`Cannot wrap read-only method ${method}`);
        return;
      }
      objectStubs[method] = original;
    } catch {
      // Read-only methods (e.g. lifecycle methods guarded by state decorators) cannot be wrapped
      diag.debug(`Cannot wrap read-only method ${method}`);
    }
  }

  /**
   * Patch all services to add span
   */
  patch() {
    const tracer = trace.getTracer("webda");
    const router = useRouter();
    // Expose the tracer to the request: its server span is started by the OtelRequestTracer
    this._wrap(router, "execute", (original: Function) => {
      return async (ctx: WebContext) => {
        ctx.setExtension("otel", tracer);
        return original(ctx);
      };
    });
    diag.debug(`Applying patch for each services`);
    const services = useCore().getServices();
    for (const i in services) {
      // Avoid patching itself and the router already wrapped above
      if (services[i] === this || services[i] === router) continue;
      for (const p of Object.getOwnPropertyNames(services[i].constructor.prototype).filter(
        item => item !== "constructor" && typeof Reflect.get(services[i], item) === "function"
      )) {
        this._wrap(services[i], p, (original: Function) => {
          return (...args: any[]) => {
            const spanName = `${i}.${p}`;
            // Avoid recursive function to be created child span
            // @ts-ignore
            if (trace.getActiveSpan()?.name === spanName) {
              return original(...args);
            }
            return tracer.startActiveSpan(spanName, span => {
              let res;
              try {
                res = original(...args);
              } catch (err) {
                span.addEvent("error", { message: err instanceof Error ? err.message : String(err) });
                span.end();
                throw err;
              }
              if (res instanceof Promise) {
                return res.finally(() => {
                  span.end();
                });
              } else {
                span.end();
                return res;
              }
            });
          };
        });
      }
    }
  }
}
