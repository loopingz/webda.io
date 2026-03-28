import * as http from "http";
import { Counter, Gauge, Histogram } from "prom-client";
import { Service } from "./service.js";
import { ServiceParameters } from "../services/serviceparameters.js";
import { WebContext } from "../contexts/webcontext.js";
export declare class PrometheusParameters extends ServiceParameters {
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
    labels?: {
        [key: string]: string;
    };
    /**
     * Prefix to add to metrics
     */
    prefix?: string;
    load(params?: any): this;
}
/**
 * This service expose metrics to Prometheus
 *
 * It can use the same server or a dedicated http server
 * We do not currently support push-gateway
 *
 * @WebdaModda
 */
export declare class PrometheusService<T extends PrometheusParameters = PrometheusParameters> extends Service<T> {
    /**
     * Metrics registered
     */
    private static requestMetricsRegistered;
    /**
     * Metrics registered
     */
    private static nodeMetricsRegistered;
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
     * @override
     */
    initMetrics(): void;
    /**
     * Close the http server if exists
     */
    stop(): Promise<void>;
    /**
     *
     * @returns
     */
    resolve(): this;
    /**
     * Serve the metrics in a webda context
     * @param ctx
     */
    serveMetrics(ctx: WebContext): Promise<void>;
}
//# sourceMappingURL=prometheus.d.ts.map