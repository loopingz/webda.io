import { DiagLogLevel, diag, trace } from "@opentelemetry/api";
import { Logger as OtelLibLogger, logs } from "@opentelemetry/api-logs";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-grpc";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { InstrumentationNodeModuleDefinition } from "@opentelemetry/instrumentation";
import { Resource } from "@opentelemetry/resources";
import { BatchLogRecordProcessor, LogRecordExporter, LoggerProvider } from "@opentelemetry/sdk-logs";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { Core, DeepPartial, HttpContext, Service, ServiceParameters } from "@webda/core";
import { WorkerLogger, WorkerMessage, WorkerOutput } from "@webda/workout";

export class OtelLogger extends WorkerLogger {
  constructor(
    protected logger: OtelLibLogger,
    output: WorkerOutput
  ) {
    super(output);
  }

  onMessage(msg: WorkerMessage) {
    this.logger.emit({
      severityText: msg.log.level,
      body: msg.log.args.join(" ")
    });
  }
}

export class OtelServiceParameters extends ServiceParameters {
  traceExporter?: {
    type: "console" | "otlp";
    /**
     * Allow to disable the logger
     * @default true
     */
    enable?: boolean;
  };
  metricExporter?: {
    type: "console" | "otlp";
    /**
     * Allow to disable the logger
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
  name?: string;
}

/**
 * Otel Service
 *
 * @WebdaModda
 */
export class OtelService<T extends OtelServiceParameters> extends Service<T> {
  sdk: NodeSDK;
  wrapper: InstrumentationNodeModuleDefinition;
  stubs: Map<
    Object,
    {
      [key: string]: Function;
    }
  >;
  otelLogger: OtelLogger;
  loggerExporter: LogRecordExporter;
  loggerProvider: LoggerProvider;

  async stop() {
    await Promise.all([super.stop(), this.loggerProvider.shutdown()]);
  }

  /**
   * Get diag level based on parameters
   * @returns
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
   * @override
   */
  resolve() {
    super.resolve();

    this.log("INFO", "Start otel");
    const pkgInfo = this.getWebda().getApplication().getPackageDescription();

    // Initiate logger

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

    // Logger part
    if (this.parameters.loggerExporter?.enable !== false) {
      this.loggerExporter ??= new OTLPLogExporter(this.parameters.loggerExporter);
      this.loggerProvider ??= new LoggerProvider();

      this.loggerProvider.addLogRecordProcessor(new BatchLogRecordProcessor(this.loggerExporter));
      this.otelLogger ??= new OtelLogger(logs.getLogger("otel"), this.getWebda().getApplication().getWorkerOutput());
    }
    this.sdk ??= new NodeSDK({
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: this.parameters.name || pkgInfo.name,
        [SemanticResourceAttributes.SERVICE_VERSION]: pkgInfo.version
      }),
      traceExporter: this.parameters.traceExporter?.enable !== false ? new OTLPTraceExporter() : undefined,
      metricReader:
        this.parameters.metricExporter?.enable !== false
          ? (new PeriodicExportingMetricReader({
              exporter: new OTLPMetricExporter()
            }) as any)
          : undefined,
      instrumentations: [getNodeAutoInstrumentations()]
    });

    this.sdk.start();
    //this.wrapper = new WebdaInstrumentation().init()[0];
    //this.wrapper.patch({}, "3.0.0");
    //this.sdk.shutdown();
    if (this.parameters.traceExporter?.enable !== false) {
      this.patch();
    }

    return this;
  }

  /**
   * Allow to reinit the service
   * @param config
   * @returns
   */
  async reinit(config: DeepPartial<T>): Promise<this> {
    await super.reinit(config);
    if (this.parameters.traceExporter?.enable !== false) {
      this.patch();
    } else {
      this.unpatch();
    }
    return this;
  }

  /**
   * Remove patched methods
   * @returns
   */
  unpatch() {
    if (!this.stubs) return;
    for (let [object, methods] of this.stubs) {
      for (let [method, original] of Object.entries(methods)) {
        object[method] = original;
      }
    }
  }

  /**
   * Wrap a method
   * @param object
   * @param method
   * @param wrapper
   */
  protected _wrap(object: Object, method: string, wrapper: Function) {
    const original = object[method];
    this.stubs ??= new Map();
    if (!this.stubs.has(object)) {
      this.stubs.set(object, {});
    }
    const objectStubs = this.stubs.get(object);
    objectStubs[method] = original;
    object[method] = wrapper(original.bind(object));
  }

  /**
   * Patch all services to add span
   */
  patch() {
    const tracer = trace.getTracer("webda");
    //Core.get().newWebContext("test");
    // Apply patch for new context -> to inject the span
    this._wrap(Core.get(), "newWebContext", (original: Function) => {
      return function (this: any, ...args: any[]) {
        return original.apply(this, args).then(ctx => {
          const originalExecute = ctx.execute;
          ctx.setExtension("otel", tracer);
          ctx.execute = async () => {
            const httpContext: HttpContext = args[0];
            return tracer.startActiveSpan(
              `${httpContext.getMethod()} ${httpContext.getPathName() || "/"}`,
              async span => {
                try {
                  return await originalExecute.apply(ctx);
                } finally {
                  span.end();
                }
              }
            );
          };
          return ctx;
        });
      };
    });
    diag.debug(`Applying patch for each services`);
    const services = Core.get().getServices();
    for (let i in services) {
      // Avoid patching itself
      if (services[i] === this) continue;
      for (let p of Object.getOwnPropertyNames(services[i].constructor.prototype).filter(
        item => typeof services[i][item] === "function"
      )) {
        this._wrap(services[i], <any>p, (original: Function) => {
          return function (this: any, ...args: any[]) {
            const spanName = `${i}.${p}`;
            // Avoid recursive function to be created child span
            // @ts-ignore
            if (trace.getActiveSpan()?.name === spanName) {
              return original.apply(services[i], args);
            }
            // get span from context?
            return tracer.startActiveSpan(spanName, span => {
              let res;
              try {
                res = original.apply(services[i], args);
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
