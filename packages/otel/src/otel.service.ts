import { DiagLogLevel, diag, trace } from "@opentelemetry/api";
import { Logger as OtelLibLogger } from "@opentelemetry/api-logs";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-grpc";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor, LogRecordExporter, LoggerProvider } from "@opentelemetry/sdk-logs";
import { ConsoleMetricExporter, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK, tracing } from "@opentelemetry/sdk-node";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { Service, ServiceParameters, WebContext, useApplication, useCore, useRouter } from "@webda/core";
import { WorkerLogger, WorkerMessage, WorkerOutput } from "@webda/workout";

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
  traceExporter?: {
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
    sampling?: number;
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
   */
  loggerExporter?: {
    /**
     * Allow to disable the logger
     * @default true
     */
    enable?: boolean;
    type?: "otlp";
    /**
     * @default http://localhost:4317
     */
    url?: string;
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
    return this;
  }
}

/**
 * Otel Service
 *
 * Start the OpenTelemetry NodeSDK, forward the logs and add a span
 * for each request and each service method call
 *
 * @WebdaModda
 */
export class OtelService<T extends OtelServiceParameters = OtelServiceParameters> extends Service<T> {
  sdk: NodeSDK;
  stubs: Map<
    object,
    {
      [key: string]: Function;
    }
  >;
  otelLogger: OtelLogger;
  loggerExporter: LogRecordExporter;
  loggerProvider: LoggerProvider;

  /**
   * Stop otlp
   */
  async stop() {
    this.unpatch();
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
      this.loggerExporter ??= new OTLPLogExporter(this.parameters.loggerExporter);
      this.loggerProvider ??= new LoggerProvider({
        resource,
        processors: [new BatchLogRecordProcessor(this.loggerExporter)]
      });
      this.otelLogger ??= new OtelLogger(this.loggerProvider.getLogger("webda"), useApplication().getWorkerOutput());
    }
    this.sdk ??= new NodeSDK({
      resource,
      traceExporter: this.getTraceExporter(),
      metricReader:
        this.parameters.metricExporter?.enable !== false
          ? (new PeriodicExportingMetricReader({
              exporter:
                this.parameters.metricExporter?.type === "console"
                  ? new ConsoleMetricExporter()
                  : new OTLPMetricExporter()
            }) as any)
          : undefined,
      instrumentations: [getNodeAutoInstrumentations()]
    });

    this.sdk.start();
    this.updatePatch();
    return this;
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
        object[method] = original;
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
    const original = object[method];
    this.stubs ??= new Map();
    if (!this.stubs.has(object)) {
      this.stubs.set(object, {});
    }
    const objectStubs = this.stubs.get(object);
    // Already patched
    if (objectStubs[method]) return;
    try {
      object[method] = wrapper(original.bind(object));
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
    const mod = Math.floor(1 / this.parameters.traceExporter.sampling);
    let count = 0;
    const router = useRouter();
    // Add a span around each request execution
    this._wrap(router, "execute", (original: Function) => {
      return async (ctx: WebContext) => {
        ctx.setExtension("otel", tracer);
        // Sampling logic
        if (mod > 1) {
          if (count++ % mod !== 0) {
            return original(ctx);
          } else {
            count = 0;
          }
        }
        const httpContext = ctx.getHttpContext();
        return tracer.startActiveSpan(`${httpContext.getMethod()} ${httpContext.getPathName() || "/"}`, async span => {
          try {
            return await original(ctx);
          } finally {
            span.end();
          }
        });
      };
    });
    diag.debug(`Applying patch for each services`);
    const services = useCore().getServices();
    for (const i in services) {
      // Avoid patching itself and the router already wrapped above
      if (services[i] === this || services[i] === router) continue;
      for (const p of Object.getOwnPropertyNames(services[i].constructor.prototype).filter(
        item => item !== "constructor" && typeof services[i][item] === "function"
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
                span.addEvent("error", { message: err.message });
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
