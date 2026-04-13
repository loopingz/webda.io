import { OperationContext } from "./operationcontext.js";
import acceptLanguage from "accept-language";
import * as http from "http";
import { HttpContext } from "./httpcontext.js";
import { Readable, Writable } from "node:stream";
import { WritableStreamBuffer } from "stream-buffers";
import { useCore, useDynamicService, useService } from "../core/hooks.js";

/**
 * @category CoreFeatures
 */
class Cookie {
  name: string;
  value: string;
  options: any;
}

/**
 * This represent in fact a WebContext
 * In 3.0 an abstract version of Context will replace this (closer to OperationContext)
 * @category CoreFeatures
 *
 */
export class WebContext<T = any, P = any, U = any> extends OperationContext<T, P, U> {
  /**
   * Contains the response headers
   */
  protected _outputHeaders: http.OutgoingHttpHeaders;

  /**
   * Current status code
   */
  statusCode: number;
  /**
   * Cookies to send back
   */
  _cookie: Map<string, Cookie>;
  /**
   *
   */
  headers: Map<string, string>;
  _route: any;

  _ended: Promise<any> = undefined;

  /**
   * If headers were flushed
   */
  protected headersFlushed: boolean;

  private _init: Promise<this>;

  /**
   * Set current http context
   * @param httpContext current http context
   */
  public setHttpContext(httpContext: HttpContext) {
    this.setExtension("http", httpContext);
    this.reinit();
  }

  /**
   * Get current http context
   * @returns the result
   */
  public getHttpContext(): HttpContext {
    return this.getExtension<HttpContext>("http");
  }

  /**
   * @override
   */
  async getRawInputAsString(
    limit: number = 1024 * 1024 * 10,
    timeout: number = 60000,
    encoding?: string
  ): Promise<string> {
    return this.getHttpContext().getRawBodyAsString(limit, timeout, encoding);
  }

  /**
   * @override
   */
  async getRawInput(limit: number = 1024 * 1024 * 10, timeout: number = 60000) {
    return (await this.getHttpContext().getRawBody(limit, timeout)) || Buffer.from("");
  }

  /**
   * @override
   */
  getRawStream(): Readable {
    return this.getHttpContext().getRawStream();
  }

  /**
   * Remove everything that was about to be sent
   */
  public resetResponse() {
    this._outputHeaders = {};
    super.resetResponse();
  }

  /**
   * Write data to the client
   *
   * @param output If it is an object it will be serializeb with toPublicJSON, if it is a String it will be appended to the result, if it is a buffer it will replace the result
   * @param ...args any arguments to pass to the toPublicJSON method
   * @param encoding - the encoding to use
   * @param cb - the callback function
   * @returns true if the condition is met
   */
  // @ts-ignore
  public write(output: U, encoding?: string, cb?: (error: Error) => void): boolean {
    if (this.statusCode === 204) {
      this.statusCode = 200;
    }
    if (typeof output === "object" && !(output instanceof Buffer) && !this.hasFlushedHeaders()) {
      this.setHeader("Content-type", "application/json");
    }
    return super.write(output, encoding, cb);
  }

  /**
   * Write the http return code and some headers
   * Those headers are not flushed yet so can still be overwritten
   *
   * @param {Number} statusCode to return to the client
   * @param {Object} headers to add to the response
   * @returns this for chaining
   */
  writeHead(statusCode: number, headers: http.OutgoingHttpHeaders = undefined): this {
    Object.entries(headers || {}).forEach(([key, value]) => {
      this.setHeader(key, value);
    });
    if (statusCode !== undefined) {
      this.statusCode = statusCode;
    }
    return this;
  }

  /**
   *
   * @returns the result
   */
  getResponseCode() {
    return this.statusCode || 200;
  }

  /**
   * Redirect to another url
   * @param url - the URL
   */
  redirect(url: string) {
    this.writeHead(302, { Location: url });
  }
  /**
   * For compatibility reason
   * @param param - the parameter name
   * @param value - the value to set
   * @param options - the options
   */
  cookie(param, value, options = undefined) {
    /** @ignore */
    if (this._cookie === undefined) {
      this._cookie = new Map();
    }
    this._cookie[param] = { name: param, value, options };
  }

  /**
   * Get all cookies set on the response
   * @returns the result map
   */
  getResponseCookies(): Map<string, Cookie> {
    return this._cookie;
  }

  /**
   * Whether the response has been ended
   * @returns the result
   */
  isEnded() {
    return this._ended;
  }

  /******************************
   *
   * Express Compatibiliy method
   *
   ******************************/

  /**
   * Express response allow statusCode to be defined this way
   * @param code to return
   * @returns this for chaining
   */
  public status(code: number): this {
    this.statusCode = code;
    return this;
  }

  /**
   * Express response allow answer to be sent this way
   * @param code to return
   * @param obj - the target object
   * @returns this for chaining
   */
  public json(obj: any): this {
    this.write(obj);
    return this;
  }

  /**
   * Return the response size
   * @returns the result
   */
  getResponseSize(): number | undefined {
    return this._body ? Buffer.byteLength(this._body, "utf8") : undefined;
  }

  /**
   * Flush the request
   *
   * @emits 'finish' event
   * @throws Error if the request was already ended
   * @returns the result
   */
  async end() {
    /** @ignore */
    if (this._ended) {
      return this._ended;
    }
    this._ended = (async () => {
      if (this.getExtension("http") && this.session) {
        try {
          const sm = useDynamicService("SessionManager");
          if (sm) await (sm as any).save(this, this.session);
        } catch {
          // SessionManager may not be available
        }
      }
      await super.end();
      if (this._stream instanceof WritableStreamBuffer && (<WritableStreamBuffer>this._stream).size()) {
        this._body = (<WritableStreamBuffer>this._stream).getContents().toString();
        this.statusCode = this.statusCode < 300 ? 200 : this.statusCode;
      }
      // Flush headers and body to the HTTP response stream
      await this.flushHeaders();
      if (this._stream && !(this._stream instanceof WritableStreamBuffer) && !(this._stream as any).writableEnded) {
        if (this._body) {
          (this._stream as any).end(this._body);
        } else {
          (this._stream as any).end();
        }
      }
    })();
    return this._ended;
  }

  /**
   * Alias to keep compatibility with WebContext
   * @param sanitizedOptions - the sanitized options
   * @returns the result
   */
  async getRequestBody(
    sanitizedOptions: any = {
      allowedTags: [],
      allowedAttributes: {}
    }
  ): Promise<T> {
    return this.getInput(sanitizedOptions);
  }

  /**
   * Get request body
   * @returns the result
   */
  getResponseBody() {
    if (!this._body && this._stream instanceof WritableStreamBuffer) {
      return (<WritableStreamBuffer>this._stream).getContents();
    }
    return this._body;
  }

  /**
   * Retrieve a http.IncomingMessage valid from Context
   *
   * Need more testing
   * @returns the result
   */
  getRequest(): http.IncomingMessage {
    const stream = Readable.from([JSON.stringify(this.getRequestBody())]);
    return <http.IncomingMessage>(<unknown>{
      httpVersionMajor: 1,
      httpVersionMinor: 0,
      headers: this.headers,
      httpVersion: "1.0",
      method: this.getHttpContext().getMethod(),
      rawHeaders: [], // TODO Regenerate headers based on the map
      rawTrailers: [],
      setTimeout: (msec, callback) => {
        setTimeout(callback, msec);
      },
      socket: undefined,
      statusCode: 200,
      trailers: {},
      url: this.getHttpContext().getUrl(),
      connection: undefined,
      ...stream
    });
  }

  /**
   * Get the request locale if found
   * @returns the result
   */
  getLocale() {
    const locales = useCore().getLocales();
    acceptLanguage.languages(locales);
    const header = this.getHttpContext().getUniqueHeader("accept-language");
    if (header) {
      return acceptLanguage.get(header);
    }
    return locales[0];
  }

  /**
   * Return true if Headers got flushed already
   * @returns the result
   */
  hasFlushedHeaders() {
    return this.headersFlushed;
  }

  /**
   * Set flushed header status
   * @param status - the HTTP status code
   */
  setFlushedHeaders(status: boolean = true) {
    this.headersFlushed = status;
  }

  /**
   * Flush stored headers and status code to the underlying stream.
   * For HTTP ServerResponse, writes via res.writeHead().
   * Called automatically by getOutputStream() before pipeline() and by end().
   */
  async flushHeaders(): Promise<void> {
    if (this.flushed) return;
    // Merge both header maps — responseHeaders (from setHeader) + _outputHeaders (from constructor defaults)
    const headers = { ...this._outputHeaders, ...this.getResponseHeaders() };
    await super.flushHeaders();
    // Write to ServerResponse if the stream supports writeHead (not a WritableStreamBuffer)
    if (this._stream && !(this._stream instanceof WritableStreamBuffer) && typeof (this._stream as any).writeHead === "function") {
      this.headersFlushed = true;
      (this._stream as any).writeHead(this.statusCode || 200, headers);
    }
    this._outputHeaders = {};
  }

  /**
   * @ignore
   * Used by Webda framework to set the body, session and output stream if known
   */
  constructor(
    httpContext: HttpContext,
    stream: Writable = undefined,
    defaultHeaders: http.OutgoingHttpHeaders = undefined
  ) {
    super(stream);
    this.setHttpContext(httpContext);
    this._outputHeaders = defaultHeaders || {
      // Gotta Cache ‘em all: bending the rules of web cache exploitation
      // https://defcon.org/html/defcon-32/dc-32-speakers.html
      "Cache-Control": "private"
    };
    this.headersFlushed = false;
    this.statusCode = 204;
    this.headers = new Map();
  }

  /**
   * Initialize the web context, loading session and setting up stream listeners
   * @param force - whether to force the operation
   * @returns this for chaining
   */
  async init(force: boolean = false): Promise<this> {
    if (this._init && !force) {
      return this._init;
    }
    this._stream.on("pipe", () => {
      // TODO Check for flush
      //      this._webda.flushHeaders(this);
      this.headersFlushed = true;
    });
    if (this.getExtension("http")) {
      this.session = (await useService("SessionManager").load(this)).getProxy();
    }
    this._init = super.init();
    return this._init;
  }
}
