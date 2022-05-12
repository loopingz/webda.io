import { parse as cookieParse } from "cookie";
import { Readable } from "stream";

export type HttpMethodType = "GET" | "OPTIONS" | "POST" | "PUT" | "PATCH" | "DELETE";

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
  path: string;
  search: string;
  protocol: "http:" | "https:";
  port: string;
  headers: any;
  origin: string;
  host: string;
  body: string | Readable | undefined;
  cookies: any;
  files: any[];
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
    body?: string | Readable,
    headers: any = {}
  ) {
    this.body = body;
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
    this.headers = headers;
    for (let i in this.headers) {
      if (i.toLowerCase() === "cookie") {
        this.cookies = cookieParse(this.headers[i]);
      }
      if (i.toLowerCase() !== i) {
        this.headers[i.toLowerCase()] = this.headers[i];
      }
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
   * Get request body
   * @returns
   */
  async getRawBody(limit: number = 1024 * 1024 * 10): Promise<string | undefined> {
    if (this.body instanceof Readable) {
      return new Promise((resolve, reject) => {
        let req = <Readable>this.body;
        let body = "";
        const limit = 1024 * 1024 * 10;
        let timeout = setTimeout(() => {
          reject("Request timeout");
        });
        req.on("readable", () => {
          if (req.readableLength + body.length > limit) {
            clearTimeout(timeout);
            reject("Request oversized");
          }
          let chunk = req.read();
          if (chunk !== null) {
            body += req.read();
          }
        });
        req.on("end", () => {
          clearTimeout(timeout);
          resolve(body);
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
    return Readable.from(this.body);
  }

  /**
   * Get HTTP Headers
   * @returns
   */
  getHeaders() {
    return this.headers;
  }

  getHeader(name: string, def?: string): string {
    return this.headers[name.toLowerCase()] || def;
  }

  setBody(body) {
    this.body = body;
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
