import { type IncomingHttpHeaders } from "http";
import { Readable } from "stream";
export type HttpMethodType = "GET" | "OPTIONS" | "POST" | "PUT" | "PATCH" | "DELETE";
/**
 * All methods supported by Webda
 */
export declare const HttpMethodTypeAny: HttpMethodType[];
type HeadersRequest = IncomingHttpHeaders & {
    [headerName: `x-${string}`]: string;
};
/**
 * The HttpContext
 *
 * It has similar properties than URL
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/URL_API
 *
 * @category CoreFeatures
 */
export declare class HttpContext {
    /**
     * Hostname
     *
     * @example test.webda.io
     */
    hostname: string;
    /**
     * HTTP Method
     */
    method: HttpMethodType;
    /**
     * Pathname
     */
    uri: string;
    /**
     * Get the client ip if available
     */
    clientIp: string;
    path: string;
    search: string;
    protocol: "http:" | "https:";
    port: string;
    headers: HeadersRequest;
    origin: string;
    host: string;
    body: Buffer | Readable | undefined;
    cookies: any;
    /**
     * URI prefix in case it is exposed through something that prefix the uri
     */
    prefix: string;
    constructor(hostname: string, method: HttpMethodType, uri: string, protocol?: "http" | "https", port?: number | string, headers?: {
        [key: string]: string | string[];
    });
    /**
     * Set the client ip
     */
    setClientIp(ip: string): this;
    /**
     * Get the client ip
     */
    getClientIp(): string;
    /**
     *
     * @see https://developer.mozilla.org/en-US/docs/Web/API/URL/href
     * @returns
     */
    getHref(): string;
    /**
     *
     * @param prefix uri to not consider
     */
    setPrefix(prefix: string): void;
    /**
     * Return Uri without prefix
     */
    getRelativeUri(): string;
    /**
     * Get full URI
     * @returns
     */
    getUrl(): string;
    /**
     * Get cookies
     * @returns
     */
    getCookies(): any;
    /**
     * Get port number as string
     *
     * If http on port 80, or https on port 443 will return ""
     */
    getPort(): string;
    /**
     * Get the port number
     */
    getPortNumber(): number;
    /**
     * Return hostname and port
     * @returns
     */
    getHost(): string;
    /**
     * Return protocol, hostname and port
     * @returns
     */
    getOrigin(): string;
    /**
     * Get the hostname
     * @returns
     */
    getHostName(): string;
    /**
     * Get HTTP Method used
     * @returns
     */
    getMethod(): HttpMethodType;
    /**
     * Get protocol used
     * @returns
     */
    getProtocol(): "http:" | "https:";
    /**
     * Get the raw body as string
     *
     * @param limit the size of readable request
     * @param timeout the time to read the request
     * @param encoding to analyze
     * @returns
     */
    getRawBodyAsString(limit?: number, timeout?: number, encoding?: string): Promise<string>;
    /**
     * Get request body
     *
     * @param limit the size of readable request
     * @param timeout the time to read the request
     * @returns
     */
    getRawBody(limit?: number, timeout?: number): Promise<Buffer | undefined>;
    /**
     * Get the body as stream
     */
    getRawStream(): Readable;
    /**
     * Get HTTP Headers
     * @returns
     */
    getHeaders(): Readonly<IncomingHttpHeaders>;
    /**
     * Get header value
     * @param name
     * @param def
     * @returns
     */
    getHeader(name: string, def?: string): string | string[];
    /**
     * Return the last header found with that name
     */
    getUniqueHeader(name: string, def?: string): string;
    /**
     * Used for test
     * @param body
     */
    setBody(body: Buffer | string | Readable | any): this;
    /**
     * Get request path name
     *
     * @see https://developer.mozilla.org/en-US/docs/Web/API/URL/pathname
     * @returns
     */
    getPathName(): string;
    /**
     * Get search section
     *
     * @see https://developer.mozilla.org/en-US/docs/Web/API/URL/search
     * @returns
     */
    getSearch(): string;
    /**
     *
     * @param uri to return absolute url from
     */
    getAbsoluteUrl(uri?: string): string;
}
export {};
//# sourceMappingURL=httpcontext.d.ts.map