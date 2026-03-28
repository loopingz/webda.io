import * as http from "http";
import { collectDefaultMetrics, Counter, Gauge, Histogram, register } from "prom-client";
import { Service } from "./service.js";
import { ServiceParameters } from "../services/serviceparameters.js";
import { useCoreEvents } from "../events/events.js";
export class PrometheusParameters extends ServiceParameters {
    load(params = {}) {
        super.load(params);
        this.url ?? (this.url = "/metrics");
        this.labels ?? (this.labels = {});
        this.includeNodeMetrics ?? (this.includeNodeMetrics = true);
        this.includeRequestMetrics ?? (this.includeRequestMetrics = true);
        this.prefix ?? (this.prefix = "");
        return this;
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
export class PrometheusService extends Service {
    /**
     * @override
     */
    initMetrics() {
        if (this.parameters.includeRequestMetrics) {
            this.metrics = {
                http_request_total: register.getSingleMetric(`${this.parameters.prefix}http_request_total`) ||
                    new Counter({
                        name: `${this.parameters.prefix}http_request_total`,
                        help: "metric_help",
                        labelNames: ["method", "statuscode", "handler"]
                    }),
                http_request_in_flight: register.getSingleMetric(`${this.parameters.prefix}http_request_in_flight`) ||
                    new Gauge({
                        name: `${this.parameters.prefix}http_request_in_flight`,
                        help: "in flight"
                    }),
                http_request_duration_milliseconds: register.getSingleMetric(`${this.parameters.prefix}http_request_duration_milliseconds`) ||
                    new Histogram({
                        name: `${this.parameters.prefix}http_request_duration_milliseconds`,
                        labelNames: ["method", "statuscode", "handler"],
                        help: "ms"
                    }),
                http_request_sizes: register.getSingleMetric(`${this.parameters.prefix}http_request_sizes`) ||
                    new Histogram({
                        name: `${this.parameters.prefix}http_request_sizes`,
                        labelNames: ["method", "statuscode", "handler"],
                        help: "o"
                    }),
                http_response_sizes: register.getSingleMetric(`${this.parameters.prefix}http_response_sizes`) ||
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
    async stop() {
        this.http?.close();
        this.http = undefined;
    }
    /**
     *
     * @returns
     */
    resolve() {
        super.resolve();
        this.parameters.with(parameters => {
            register.setDefaultLabels(parameters.labels);
            if (!parameters.portNumber) {
                this.addRoute(parameters.url || "/metrics", ["GET"], this.serveMetrics);
            }
            else {
                this.log("INFO", `Listening for prometheus scraper on ${parameters.bind || ""}:${parameters.portNumber}`);
                // Close previous server if any
                this.http?.close();
                this.http = http
                    .createServer(async (req, res) => {
                    if (req.method === "GET" && req.url === parameters.url) {
                        res.writeHead(200, { "Content-Type": register.contentType });
                        res.write(await register.metrics());
                    }
                    else {
                        res.writeHead(404);
                    }
                    res.end();
                })
                    .listen(parameters.portNumber, parameters.bind);
            }
            // Only register on events if we need to get metrics
            if (parameters.includeRequestMetrics) {
                useCoreEvents("Webda.Request", ({ context }) => {
                    if (context.getHttpContext().getRelativeUri() === parameters.url) {
                        return;
                    }
                    this.metrics.http_request_in_flight.inc();
                    context.setExtension("prometheus", {
                        timer: this.metrics.http_request_duration_milliseconds.startTimer()
                    });
                });
                useCoreEvents("Webda.Result", ({ context }) => {
                    if (context.getHttpContext().getRelativeUri() === parameters.url) {
                        return;
                    }
                    const staticLabels = parameters.labels || {};
                    const labels = {
                        handler: context.getHttpContext().getRelativeUri(),
                        method: context.getHttpContext().getMethod(),
                        statuscode: context.statusCode,
                        ...staticLabels
                    };
                    context
                        .getExtension("prometheus")
                        .timer(this.parameters.partitionHistogram ? labels : staticLabels);
                    this.metrics.http_request_total.inc(labels, 1);
                    if (["PUT", "POST", "PATCH"].includes(context.getHttpContext().getMethod())) {
                        this.metrics.http_request_sizes.observe(this.parameters.partitionHistogram ? labels : staticLabels, Number.parseInt(context.getHttpContext().getHeaders()["content-length"] || "0"));
                        this.metrics.http_response_sizes.observe(this.parameters.partitionHistogram ? labels : staticLabels, Number.parseInt(context.getResponseHeaders["content-length"] || "0"));
                    }
                    this.metrics.http_request_in_flight.dec(staticLabels, 1);
                });
            }
        });
        return this;
    }
    /**
     * Serve the metrics in a webda context
     * @param ctx
     */
    async serveMetrics(ctx) {
        ctx.write(await register.metrics());
    }
}
/**
 * Metrics registered
 */
PrometheusService.requestMetricsRegistered = false;
/**
 * Metrics registered
 */
PrometheusService.nodeMetricsRegistered = false;
//# sourceMappingURL=prometheus.js.map