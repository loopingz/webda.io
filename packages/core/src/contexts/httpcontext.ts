import { parse as cookieParse } from "cookie";
import { type IncomingHttpHeaders } from "http";
import { Readable } from "stream";

export type HttpMethodType = "GET" | "OPTIONS" | "POST" | "PUT" | "PATCH" | "DELETE";
/**
 * All methods supported by Webda
 */
export const HttpMethodTypeAny: HttpMethodType[] = ["GET", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"];

type HeadersRequest = IncomingHttpHeaders & {
  // Permit any property starting with 'x-'.
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
export class HttpContext {
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
  prefix: string = "";

  constructor(
    hostname: string,
    method: HttpMethodType,
    uri: string,
    protocol: "http" | "https" = "http",
    port: number | string = "80",
    headers: { [key: string]: string | string[] } = {}
  ) {
    this.hostname = hostname;
    this.method = method;
    this.uri = uri;
    [this.path, this.search] = uri.split("?");
    if (this.search) {
      this.search = "?" + this.search;
    } else {
      this.search = "";
    }
    // @ts-ignore
    this.protocol = <unknown>protocol + ":";
    this.port = port.toString();
    this.headers = {};
    for (const i in headers) {
      if (i.toLowerCase() === "cookie") {
        this.cookies = Array.isArray(headers[i])
          ? (<string[]>headers[i]).map(c => cookieParse(c))
          : cookieParse(<string>headers[i]);
      }
      this.headers[i.toLowerCase()] = headers[i];
    }
    let portUrl = "";
    if (
      port !== undefined &&
      ((this.port !== "80" && protocol === "http") || (this.port !== "443" && protocol === "https"))
    ) {
      portUrl = ":" + port;
    } else {
      this.port = "";
    }
    this.origin = this.protocol + "//" + this.hostname + portUrl;
    this.host = this.hostname + portUrl;
  }

  /**
   * Set the client ip
   */
  setClientIp(ip: string): this {
    this.clientIp = ip;
    return this;
  }

  /**
   * Get the client ip
   */
  getClientIp(): string {
    return this.clientIp;
  }

  /**
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/API/URL/href
   * @returns
   */
  getHref(): string {
    return this.getAbsoluteUrl();
  }

  /**
   *
   * @param prefix uri to not consider
   */
  setPrefix(prefix: string): void {
    if (prefix.endsWith("/")) {
      prefix = prefix.substring(0, prefix.length - 1);
    }
    this.prefix = prefix;
  }

  /**
   * Return Uri without prefix
   */
  getRelativeUri(): string {
    return this.uri.substring(this.prefix.length);
  }

  /**
   * Get full URI
   * @returns
   */
  getUrl(): string {
    return this.uri;
  }

  /**
   * Get cookies
   * @returns
   */
  getCookies() {
    return this.cookies;
  }

  /**
   * Get port number as string
   *
   * If http on port 80, or https on port 443 will return ""
   */
  getPort(): string {
    return this.port;
  }

  /**
   * Get the port number
   */
  getPortNumber(): number {
    if (this.port) {
      return Number.parseInt(this.port);
    }
    if (this.protocol === "https:") {
      return 443;
    } else {
      return 80;
    }
  }

  /**
   * Return hostname and port
   * @returns
   */
  getHost(): string {
    return this.host;
  }

  /**
   * Return protocol, hostname and port
   * @returns
   */
  getOrigin(): string {
    return this.origin;
  }

  /**
   * Get the hostname
   * @returns
   */
  getHostName(): string {
    return this.hostname;
  }

  /**
   * Get HTTP Method used
   * @returns
   */
  getMethod(): HttpMethodType {
    return this.method;
  }

  /**
   * Get protocol used
   * @returns
   */
  getProtocol(): "http:" | "https:" {
    return this.protocol;
  }

  /**
   * Get the raw body as string
   *
   * @param limit the size of readable request
   * @param timeout the time to read the request
   * @param encoding to analyze
   * @returns
   */
  async getRawBodyAsString(limit: number = 1024 * 1024 * 10, timeout: number = 60000, encoding?: string) {
    // Get charset from header
    if (!encoding) {
      const match = this.getUniqueHeader("content-type", "charset=utf-8").match(/charset=([^;\s]+)/);
      if (match) {
        encoding = match[1].trim();
      } else {
        encoding = "utf-8";
      }
    }
    if (encoding !== "utf-8") {
      throw new Error("Only UTF-8 is currently managed: https://github.com/loopingz/webda.io/issues/221");
    }
    return ((await this.getRawBody(limit, timeout)) || Buffer.from("")).toString(<BufferEncoding>encoding);
  }

  /**
   * Get request body
   *
   * @param limit the size of readable request
   * @param timeout the time to read the request
   * @returns
   */
  async getRawBody(limit: number = 1024 * 1024 * 10, timeout: number = 60000): Promise<Buffer | undefined> {
    if (this.body instanceof Readable) {
      return new Promise((resolve, reject) => {
        const req = <Readable>this.body;
        const body = [];
        const timeoutId = setTimeout(() => {
          reject("Request timeout");
        }, timeout);
        req.on("readable", () => {
          const chunk = req.read();
          if (chunk !== null) {
            if (chunk.length + body.length > limit) {
              clearTimeout(timeoutId);
              reject("Request oversized");
            }
            body.push(chunk);
          }
        });
        req.on("end", () => {
          clearTimeout(timeoutId);
          // Cache body as stream won't be able to be read twice
          this.body = Buffer.concat(body);
          resolve(this.body);
        });
      });
    } else {
      return this.body;
    }
  }

  /**
   * Get the body as stream
   */
  getRawStream(): Readable {
    if (this.body instanceof Readable) {
      return this.body;
    }
    return Readable.from(this.body || Buffer.from(""));
  }

  /**
   * Get HTTP Headers
   * @returns
   */
  getHeaders(): Readonly<IncomingHttpHeaders> {
    return this.headers;
  }

  /**
   * Get header value
   * @param name
   * @param def
   * @returns
   */
  getHeader(name: string, def?: string): string | string[] {
    return this.headers[name.toLowerCase()] || def;
  }

  /**
   * Return the last header found with that name
   */
  getUniqueHeader(name: string, def?: string): string {
    const header = this.getHeader(name, def);
    if (Array.isArray(header)) {
      return header.pop() || def;
    }
    return header || def;
  }

  /**
   * Used for test
   * @param body
   */
  setBody(body: Buffer | string | Readable | any): this {
    if (body instanceof Readable || body instanceof Buffer) {
      this.body = body;
    } else if (typeof body === "string") {
      this.body = Buffer.from(body);
    } else if (body === undefined) {
      this.body = undefined;
    } else {
      this.body = Buffer.from(JSON.stringify(body));
    }
    return this;
  }
  /**
   * Get request path name
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/API/URL/pathname
   * @returns
   */
  getPathName() {
    return this.path;
  }

  /**
   * Get search section
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/API/URL/search
   * @returns
   */
  getSearch() {
    return this.search;
  }

  /**
   *
   * @param uri to return absolute url from
   */
  getAbsoluteUrl(uri: string = this.uri): string {
    if (uri.match(/^\w{1,10}:\/\//)) {
      return uri;
    }
    if (!uri.startsWith("/")) {
      uri = "/" + uri;
    }
    if (this.port) {
      return `${this.protocol}//${this.hostname}:${this.port}${uri}`;
    }
    return `${this.protocol}//${this.hostname}${uri}`;
  }
}
