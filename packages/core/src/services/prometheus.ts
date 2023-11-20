import * as http from "http";
import { collectDefaultMetrics, Counter, Gauge, Histogram, register } from "prom-client";
import { WebContext } from "../utils/context";
import { Service, ServiceParameters } from "./service";

interface PrometheusExtension {
  timer: (labels?: Partial<Record<string, string | number>> | undefined) => number;
}

export class PrometheusParameters extends ServiceParameters {
  /**
   * If defined will launch another http server to serve the scaper
   */
  portNumber?: number;
  /**
   * If defined along with portNumber used to bind specific address
   * for dedicated http server
   */
  bind?: string;
  /**
   * @default /metrics
   */
  url?: string;
  /**
   * Include NodeJS engine metrics
   *
   * @default true
   */
  includeNodeMetrics: boolean;
  /**
   * Include request served by Webda
   *
   * It should generate common http_* metrics
   * @default true
   */
  includeRequestMetrics: boolean;
  /**
   * Do not partition histogram with requests labels
   */
  partitionHistogram?: boolean;
  /**
   * Labels to add
   */
  labels?: { [key: string]: string };

  /**
   * Prefix to add to metrics
   */
  prefix?: string;

  constructor(params: any) {
    super(params);
    this.url ??= "/metrics";
    this.labels ??= {};
    this.includeNodeMetrics ??= true;
    this.includeRequestMetrics ??= true;
    this.prefix ??= "";
  }
}

/**
 * This service expose metrics to Prometheus
 *
 * It can use the same server or a dedicated http server
 * We do not currently support push-gateway
 *
 * @WebdaModda
 */
export class PrometheusService<T extends PrometheusParameters = PrometheusParameters> extends Service<T> {
  /**
   * Metrics registered
   */
  private static requestMetricsRegistered = false;
  /**
   * Metrics registered
   */
  private static nodeMetricsRegistered = false;

  metrics: {
    http_request_total: Counter;
    http_request_in_flight: Gauge;
    http_request_duration_milliseconds: Histogram;
    http_request_sizes: Histogram;
    http_response_sizes: Histogram;
  };

  /**
   * If we expose prometheus on another port
   */
  http?: http.Server;

  /**
   *
   * @param params
   * @returns
   */
  loadParameters(params: any) {
    return new PrometheusParameters(params);
  }

  /**
   * @override
   */
  initMetrics(): void {
    if (this.parameters.includeRequestMetrics) {
      this.metrics = {
        http_request_total:
          <Counter>register.getSingleMetric(`${this.parameters.prefix}http_request_total`) ||
          new Counter({
            name: `${this.parameters.prefix}http_request_total`,
            help: "metric_help",
            labelNames: ["method", "statuscode", "handler"]
          }),
        http_request_in_flight:
          <Gauge>register.getSingleMetric(`${this.parameters.prefix}http_request_in_flight`) ||
          new Gauge({
            name: `${this.parameters.prefix}http_request_in_flight`,
            help: "in flight"
          }),
        http_request_duration_milliseconds:
          <Histogram>register.getSingleMetric(`${this.parameters.prefix}http_request_duration_milliseconds`) ||
          new Histogram({
            name: `${this.parameters.prefix}http_request_duration_milliseconds`,
            labelNames: ["method", "statuscode", "handler"],
            help: "ms"
          }),
        http_request_sizes:
          <Histogram>register.getSingleMetric(`${this.parameters.prefix}http_request_sizes`) ||
          new Histogram({
            name: `${this.parameters.prefix}http_request_sizes`,
            labelNames: ["method", "statuscode", "handler"],
            help: "o"
          }),
        http_response_sizes:
          <Histogram>register.getSingleMetric(`${this.parameters.prefix}http_response_sizes`) ||
          new Histogram({
            name: `${this.parameters.prefix}http_response_sizes`,
            labelNames: ["method", "statuscode", "handler"],
            help: "o"
          })
      };
    }
    if (this.parameters.includeNodeMetrics && !PrometheusService.nodeMetricsRegistered) {
      PrometheusService.nodeMetricsRegistered = true;
      collectDefaultMetrics({
        register,
        labels: this.parameters.labels,
        prefix: this.parameters.prefix
      });
    }
  }

  /**
   * Close the http server if exists
   */
  async stop(): Promise<void> {
    this.http?.close();
    this.http = undefined;
  }

  /**
   *
   * @returns
   */
  resolve() {
    super.resolve();
    register.setDefaultLabels(this.parameters.labels);
    if (!this.parameters.portNumber) {
      this.addRoute(this.parameters.url || "/metrics", ["GET"], this.serveMetrics);
    } else {
      this.log(
        "INFO",
        `Listening for prometheus scraper on ${this.parameters.bind || ""}:${this.parameters.portNumber}`
      );
      this.http ??= http
        .createServer(async (req, res) => {
          if (req.method === "GET" && req.url === this.parameters.url) {
            res.writeHead(200, { "Content-Type": register.contentType });
            res.write(await register.metrics());
            res.end();
          }
          res.writeHead(404);
          res.end();
        })
        .listen(this.parameters.portNumber, this.parameters.bind);
    }
    // Only register on events if we need to get metrics
    if (this.parameters.includeRequestMetrics) {
      this.getWebda().on("Webda.Request", ({ context }) => {
        if (context.getHttpContext().getRelativeUri() === this.parameters.url) {
          return;
        }
        this.metrics.http_request_in_flight.inc();
        context.setExtension("prometheus", <PrometheusExtension>{
          timer: this.metrics.http_request_duration_milliseconds.startTimer()
        });
      });
      this.getWebda().on("Webda.Result", ({ context }) => {
        if (context.getHttpContext().getRelativeUri() === this.parameters.url) {
          return;
        }
        const staticLabels = this.parameters.labels || {};
        const labels = {
          handler: context.getHttpContext().getRelativeUri(),
          method: context.getHttpContext().getMethod(),
          statuscode: context.statusCode,
          ...staticLabels
        };
        context
          .getExtension<PrometheusExtension>("prometheus")
          .timer(this.parameters.partitionHistogram ? labels : staticLabels);
        this.metrics.http_request_total.inc(labels, 1);
        if (["PUT", "POST", "PATCH"].includes(context.getHttpContext().getMethod())) {
          this.metrics.http_request_sizes.observe(
            this.parameters.partitionHistogram ? labels : staticLabels,
            Number.parseInt(context.getHttpContext().getHeaders()["content-length"] || "0")
          );
          this.metrics.http_response_sizes.observe(
            this.parameters.partitionHistogram ? labels : staticLabels,
            Number.parseInt(context.getResponseHeaders["content-length"] || "0")
          );
        }
        this.metrics.http_request_in_flight.dec(staticLabels, 1);
      });
    }
    return this;
  }

  /**
   * Serve the metrics in a webda context
   * @param ctx
   */
  async serveMetrics(ctx: WebContext) {
    ctx.write(await register.metrics());
  }
}
