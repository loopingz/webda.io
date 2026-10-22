import { parse as cookieParse } from "cookie";
import { type IncomingHttpHeaders } from "http";
import { Readable } from "stream";
import { HttpError, UnsupportedMediaType } from "../errors/errors.js";
import type { ClientCertificate } from "./clientcertificate.js";

export type HttpMethodType = "GET" | "OPTIONS" | "POST" | "PUT" | "PATCH" | "DELETE";
/**
 * All methods supported by Webda
 */
export const HttpMethodTypeAny: HttpMethodType[] = ["GET", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"];

/**
 * Extract the charset parameter from a Content-Type header value
 *
 * The parameter name is matched case-insensitively, surrounding quotes and whitespace are removed
 *
 * @param contentType the Content-Type header value
 * @returns the charset label or undefined if none is present
 */
export function getCharset(contentType?: string): string | undefined {
  const match = contentType?.match(/;\s*charset\s*=\s*("[^"]*"|[^;]*)/i);
  if (!match) {
    return undefined;
  }
  const charset = match[1]
    .trim()
    .replace(/^"(.*)"$/, "$1")
    .trim();
  return charset || undefined;
}

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
   * Client certificate presented with the request (mTLS), if any
   */
  clientCertificate?: ClientCertificate;

  /**
   * URI prefix in case it is exposed through something that prefix the uri
   */
  prefix: string = "";

  /** Create a new HttpContext
   * @param hostname - the request hostname
   * @param method - the HTTP method
   * @param uri - the request URI
   * @param protocol - the protocol
   * @param port - the port number
   * @param headers - the request headers
   */
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
   * @param ip - the IP address
   * @returns this for chaining
   */
  setClientIp(ip: string): this {
    this.clientIp = ip;
    return this;
  }

  /**
   * Get the client ip
   * @returns the result string
   */
  getClientIp(): string {
    return this.clientIp;
  }

  /**
   * Set the client certificate presented with the request
   * @param cert - the certificate, undefined to remove it
   * @returns this for chaining
   */
  setClientCertificate(cert: ClientCertificate | undefined): this {
    this.clientCertificate = cert;
    return this;
  }

  /**
   * Get the client certificate presented with the request
   *
   * Check `verified` before trusting it: an unverified certificate was not checked against a trusted CA
   * @returns the certificate, undefined when none was presented
   */
  getClientCertificate(): ClientCertificate | undefined {
    return this.clientCertificate;
  }

  /**
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/API/URL/href
   * @returns the result string
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
   *
   * The prefix is only removed on a path boundary, so prefix `/prod` does not strip `/production`
   * @returns the result string
   */
  getRelativeUri(): string {
    if (!this.prefix || !this.uri.startsWith(this.prefix)) {
      return this.uri;
    }
    const relative = this.uri.substring(this.prefix.length);
    if (relative === "" || relative.startsWith("?")) {
      return "/" + relative;
    }
    if (!relative.startsWith("/")) {
      return this.uri;
    }
    return relative;
  }

  /**
   * Get full URI
   * @returns the result string
   */
  getUrl(): string {
    return this.uri;
  }

  /**
   * Get cookies
   * @returns the result
   */
  getCookies() {
    return this.cookies;
  }

  /**
   * Get port number as string
   *
   * If http on port 80, or https on port 443 will return ""
   * @returns the result string
   */
  getPort(): string {
    return this.port;
  }

  /**
   * Get the port number
   * @returns the result number
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
   * @returns the result string
   */
  getHost(): string {
    return this.host;
  }

  /**
   * Return protocol, hostname and port
   * @returns the result string
   */
  getOrigin(): string {
    return this.origin;
  }

  /**
   * Get the hostname
   * @returns the result string
   */
  getHostName(): string {
    return this.hostname;
  }

  /**
   * Get HTTP Method used
   * @returns the result
   */
  getMethod(): HttpMethodType {
    return this.method;
  }

  /**
   * Get protocol used
   * @returns the result
   */
  getProtocol(): "http:" | "https:" {
    return this.protocol;
  }

  /**
   * Get the raw body as string
   *
   * Any WHATWG Encoding Standard label is accepted (utf-8, iso-8859-1, shift_jis, gbk, utf-16le, ...)
   * A leading BOM is stripped
   *
   * @param limit the size of readable request
   * @param timeout the time to read the request
   * @param encoding to decode with, default to the Content-Type charset or utf-8
   * @returns the result
   * @throws UnsupportedMediaType if the encoding is not supported
   */
  async getRawBodyAsString(limit: number = 1024 * 1024 * 10, timeout: number = 60000, encoding?: string) {
    const label = encoding ?? getCharset(this.getUniqueHeader("content-type")) ?? "utf-8";
    let decoder: TextDecoder;
    try {
      decoder = new TextDecoder(label);
    } catch (err) {
      if (err instanceof RangeError) {
        throw new UnsupportedMediaType(`Unsupported charset '${label}'`);
      }
      throw err;
    }
    return decoder.decode((await this.getRawBody(limit, timeout)) ?? Buffer.alloc(0));
  }

  /**
   * Get request body
   *
   * @param limit the size of readable request
   * @param timeout the time to read the request
   * @returns the result
   * @throws HttpError 413 if the body is bigger than limit, 408 if it is not read within timeout
   */
  async getRawBody(limit: number = 1024 * 1024 * 10, timeout: number = 60000): Promise<Buffer | undefined> {
    if (this.body instanceof Readable) {
      return new Promise((resolve, reject) => {
        const req = <Readable>this.body;
        const body: Buffer[] = [];
        let total = 0;
        let done = false;
        const fail = (err: Error) => {
          done = true;
          clearTimeout(timeoutId);
          req.removeAllListeners("readable");
          req.destroy();
          reject(err);
        };
        const timeoutId = setTimeout(() => {
          fail(new HttpError("Request timeout", 408));
        }, timeout);
        req.on("readable", () => {
          let chunk: Buffer | null;
          while (!done && (chunk = req.read()) !== null) {
            if (total + chunk.length > limit) {
              fail(new HttpError("Request oversized", 413));
              return;
            }
            total += chunk.length;
            body.push(chunk);
          }
        });
        req.on("error", err => {
          if (!done) {
            fail(err);
          }
        });
        req.on("end", () => {
          if (done) {
            return;
          }
          done = true;
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
   * @returns the result
   */
  getRawStream(): Readable {
    if (this.body instanceof Readable) {
      return this.body;
    }
    return Readable.from(this.body || Buffer.from(""));
  }

  /**
   * Get HTTP Headers
   * @returns the result
   */
  getHeaders(): Readonly<IncomingHttpHeaders> {
    return this.headers;
  }

  /**
   * Get header value
   * @param name - the name to use
   * @param def - the default value
   * @returns the list of results
   */
  getHeader(name: string, def: string): string | string[];
  /** Read a header without a fallback. */
  getHeader(name: string): string | string[] | undefined;
  /** Read a header with an optional fallback. */
  getHeader(name: string, def?: string): string | string[] | undefined;
  /**
   * Read a header, using the fallback when absent.
   * @param name - the header name
   * @param def - the fallback value
   * @returns the header or its fallback
   */
  getHeader(name: string, def?: string): string | string[] | undefined {
    return this.headers[name.toLowerCase()] || def;
  }

  /**
   * Return the last header found with that name
   * @param name - the name to use
   * @param def - the default value
   * @returns the result string
   */
  getUniqueHeader(name: string, def: string): string;
  /** Read the last value of a header without a fallback. */
  getUniqueHeader(name: string): string | undefined;
  /** Read a header with an optional fallback. */
  getUniqueHeader(name: string, def?: string): string | undefined;
  /**
   * Read the last header value, using the fallback when absent.
   * @param name - the header name
   * @param def - the fallback value
   * @returns the header or its fallback
   */
  getUniqueHeader(name: string, def?: string): string | undefined {
    const header = this.getHeader(name, def);
    if (Array.isArray(header)) {
      return header.pop() || def;
    }
    return header || def;
  }

  /**
   * Used for test
   * @param body - the request body
   * @returns this for chaining
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
   * @returns the result
   */
  getPathName() {
    return this.path;
  }

  /**
   * Get search section
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/API/URL/search
   * @returns the result
   */
  getSearch() {
    return this.search;
  }

  /**
   * Return the absolute url of the request, or of an application uri
   *
   * An application uri is relative to the prefix, so the prefix is added to it
   *
   * @param uri to return absolute url from, the request uri by default
   * @returns the result string
   */
  getAbsoluteUrl(uri?: string): string {
    if (uri === undefined) {
      uri = this.uri;
    } else if (uri.match(/^\w{1,10}:\/\//)) {
      return uri;
    } else {
      if (!uri.startsWith("/")) {
        uri = "/" + uri;
      }
      uri = this.prefix + uri;
    }
    if (this.port) {
      return `${this.protocol}//${this.hostname}:${this.port}${uri}`;
    }
    return `${this.protocol}//${this.hostname}${uri}`;
  }
}
