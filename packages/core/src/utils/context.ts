import { WorkerLogLevel } from "@webda/workout";
import acceptLanguage from "accept-language";
import { EventEmitter } from "events";
import * as http from "http";
import sanitize from "sanitize-html";
import { PipelineOptions, Readable, Writable } from "stream";
import { WritableStreamBuffer } from "stream-buffers";
import { Core } from "../core";
import { NotEnumerable } from "../models/coremodel";
import { User } from "../models/user";
import { Service } from "../services/service";
import { Session, SessionManager } from "../utils/session";
import { HttpContext } from "./httpcontext";
import { JSONUtils } from "./serializers";
import { pipeline } from "node:stream/promises";

/**
 * @category CoreFeatures
 */
class Cookie {
  name: string;
  value: string;
  options: any;
}

/**
 * Data provided by the context
 */
export interface ContextProviderInfo {
  /**
   * Stream to write to
   */
  stream?: Writable;
  /**
   * If this is http context
   */
  http?: HttpContext;
  /**
   * true if this is a global context
   */
  global?: boolean;
  /**
   * Can contain any type of information
   */
  [key: string]: any;
}

/**
 * @category CoreFeatures
 */
export interface ContextProvider {
  /**
   * Info can contain any type of information
   * @param info
   */
  getContext(info: ContextProviderInfo): OperationContext;
}

/**
 * OperationInput
 */
export type OperationInput<T = any, U = any> = {
  input: T;
  parameters: U;
};

/**
 * OperationContext is used when call to an operation
 *
 * @param T type of input for this context
 * @param U type of output for this context
 * @param P type of parameters for this context
 */
export class OperationContext<T = any, U = any, P = any> extends EventEmitter {
  protected static __globalContext: OperationContext;
  /**
   * Contain emitting Core
   */
  @NotEnumerable
  protected _webda: Core;
  /**
   * Session
   */
  protected session: Session;
  /**
   * Allow extensions
   */
  protected extensions: { [key: string]: any };
  /**
   * Contain the sanitized request body if computed
   */
  protected _sanitized: any;

  /**
   * Output
   */
  protected _body: string;

  /**
   * Loaded user if exist
   */
  private user: User;

  /**
   * Contain all registered promises to this context
   */
  @NotEnumerable
  _promises: Promise<any>[];
  parameters: P;

  /**
   * @ignore
   * Used by Webda framework to set the body, session and output stream if known
   */
  constructor(webda: Core, stream: Writable = undefined) {
    super();
    this.extensions = {};
    this._webda = webda;
    this._promises = [];
    this._body = undefined;
    this._stream = stream;
    if (stream === undefined) {
      this.createStream();
    }
    this.parameters = <any>{};
  }

  /**
   * Output stream
   */
  @NotEnumerable
  _stream: Writable;
  /**
   * Get an extension of the context
   * @param name of the extension
   * @returns extension object
   */
  public getExtension<K = any>(name: string): K {
    return <K>this.extensions[name];
  }

  /**
   * Get one parameter
   * @param name
   * @returns
   */
  public parameter(name: string, defaultValue: any = undefined): any {
    return this.getParameters()[name] ?? defaultValue;
  }

  /**
   * Get the parameters
   * @returns
   */
  public getParameters(): P {
    return this.parameters;
  }

  /**
   * Set the parameters
   */
  public setParameters(params: P) {
    this.parameters = params;
  }

  /**
   * For easier compatibility with WebContext
   * On OperationContext this call is simply ignored
   */
  setHeader(_name: string, _value: string) {
    // Do nothing
  }

  /**
   * For easier compatibility with WebContext
   * On OperationContext this call is simply ignored
   */
  writeHead(_code: number, _headers: any) {
    // Do nothing
  }

  /**
   *
   * @param name to add
   * @param extension object to store
   */
  public setExtension(name: string, extension: any): this {
    this.extensions[name] = extension;
    return this;
  }

  /**
   * Return the webda
   */
  getWebda() {
    return this._webda;
  }

  /**
   * Register a promise with the context
   * @param promise
   */
  addAsyncRequest(promise) {
    this._promises.push(promise);
  }

  /**
   * Get output as string, if a OutputStream is provided it will returned null
   * @returns
   */
  getOutput(): string {
    if (this._stream instanceof WritableStreamBuffer && (<WritableStreamBuffer>this._stream).size()) {
      return (<WritableStreamBuffer>this._stream).getContents().toString();
    }
    return this._body;
  }

  /**
   * Get current http context
   */
  public getHttpContext(): HttpContext | undefined {
    return this.getExtension<HttpContext>("http");
  }

  /**
   * Ensure the whole execution is finished
   */
  async end() {
    this.emit("end");
    await Promise.all(this._promises);
    this.emit("close");
  }

  /**
   * Remove the input
   */
  clearInput() {
    this._sanitized = {};
  }

  async getInput(
    sanitizedOptions: sanitize.IOptions & { defaultValue?: any; raw?: boolean | string[] } = {
      allowedTags: [],
      allowedAttributes: {}
    }
  ): Promise<T> {
    if (this._sanitized && !sanitizedOptions.raw) {
      return this._sanitized;
    }
    const recursiveSanitize = (obj, options = undefined, path: string = "") => {
      if (typeof obj === "string") {
        return sanitize(obj, options);
      }
      if (obj !== null && typeof obj === "object") {
        Object.keys(obj).forEach(key => {
          obj[key] =
            Array.isArray(sanitizedOptions.raw) && sanitizedOptions.raw.includes(path + key)
              ? obj[key]
              : recursiveSanitize(obj[key], options, path + key + ".");
        });
      }
      return obj;
    };
    try {
      const data = await this.getRawInputAsString(
        this.getWebda().getGlobalParams().requestLimit,
        this.getWebda().getGlobalParams().requestTimeout
      );
      if (sanitizedOptions.raw === true) {
        return JSON.parse(data || sanitizedOptions.defaultValue);
      }
      if (!data || data.length === 0) {
        this._sanitized = sanitizedOptions.defaultValue;
        return this._sanitized;
      }
      this._sanitized = recursiveSanitize(JSON.parse(data), sanitizedOptions);
    } catch (err) {
      this.log("ERROR", err, `Body: '${await this.getRawInputAsString()}'`);
      this._sanitized = sanitizedOptions.defaultValue;
    }
    return this._sanitized;
  }

  /**
   * By default empty
   * @returns
   */
  async getRawInputAsString(
    limit: number = 1024 * 1024 * 10,
    timeout: number = 60000,
    encoding?: BufferEncoding
  ): Promise<string> {
    return (await this.getRawInput(limit, timeout)).toString(encoding);
  }

  /**
   * @override
   */
  async getRawInput(_limit: number = 1024 * 1024 * 10, _timeout: number = 60000): Promise<Buffer> {
    return Buffer.from("");
  }

  /**
   * @override
   */
  getRawStream(): Readable {
    return undefined;
  }

  /**
   * Get the HTTP stream to output raw data
   * @returns {*}
   */
  getOutputStream() {
    return this._stream;
  }

  /**
   * Get linked session
   * @returns
   */
  public getSession<K = Session>(): K {
    return <K>(<unknown>this.session);
  }

  /**
   * Remove sanitized body
   */
  public reinit() {
    this._sanitized = undefined;
    if (!this._stream || this._stream instanceof WritableStreamBuffer) {
      this.createStream();
    }
  }

  /**
   * Create a buffer stream
   */
  createStream() {
    this._stream = new WritableStreamBuffer({
      initialSize: 100 * 1024,
      incrementAmount: 100 * 1024
    });
  }

  /**
   * Proxy for simplification
   * @param level
   * @param args
   */
  log(level: WorkerLogLevel, ...args: any[]) {
    this._webda.log(level, ...args);
  }

  /**
   * Create a new session
   * @returns
   */
  async newSession() {
    this.session = await this._webda.getService<SessionManager>("SessionManager").newSession(this);
    return this.session;
  }

  /**
   * Remove everything that was about to be sent
   */
  public resetResponse() {
    this._body = undefined;
    if (this._stream instanceof WritableStreamBuffer) {
      this.createStream();
    }
  }

  /**
   * Write data to the client
   *
   * @param output If it is an object it will be serialized with toPublicJSON, if it is a String it will be appended to the result, if it is a buffer it will replace the result
   * @param ...args any arguments to pass to the toPublicJSON method
   */
  public write(output: U, _encoding?: string, _cb?: (error: Error) => void): boolean {
    if (!output) {
      return false;
    }
    if (typeof output === "object" && !(output instanceof Buffer)) {
      this._body = JSONUtils.stringify(output, undefined, 0, true);
    } else if (typeof output == "string") {
      if (this._body == undefined) {
        this._body = "";
      }
      this._body += output;
    } else {
      this._body = output.toString();
    }
    return true;
  }

  async init(): Promise<this> {
    return this;
  }

  /**
   * Get the current user from session
   */
  async getCurrentUser<K extends User>(refresh: boolean = false): Promise<K> {
    if (!this.getCurrentUserId()) {
      return undefined;
    }
    // Caching the answer
    if (!this.user || refresh) {
      this.user = <User>await this._webda.getApplication().getModel("User").ref(this.getCurrentUserId()).get(this);
    }
    return <K>this.user;
  }

  /**
   * Get the current user id from session
   */
  getCurrentUserId() {
    if (this.session) {
      return this.session.userId;
    }
    return undefined;
  }

  /**
   * Global context is the default Context
   *
   * Whenever a request is internal to the system
   * or not linked to a user request
   * @returns
   */
  isGlobal() {
    return false;
  }
}

export class GlobalContext extends OperationContext {
  session: Session = new Session();

  constructor(webda: Core) {
    super(webda);
    this.session.login("system", "system");
    // Disable logout
    this.session.logout = () => {};
  }

  /**
   * @override
   */
  isGlobal() {
    return true;
  }
}
/**
 * Simple Operation Context with custom input
 */
export class SimpleOperationContext extends OperationContext {
  constructor(webda: Core) {
    super(webda);
  }
  input: Buffer;

  /**
   * Create another context from an existing one
   * @param context
   * @returns
   */
  static async fromContext(context: OperationContext): Promise<SimpleOperationContext> {
    const ctx = new SimpleOperationContext(context.getWebda());
    ctx.setSession(context.getSession());
    ctx.setInput(Buffer.from(JSONUtils.stringify(await context.getInput())));
    return ctx;
  }

  /**
   * Set the input
   */
  setInput(input: Buffer): this {
    this.input = input;
    return this;
  }

  /**
   * Set the session
   * @param session
   * @returns
   */
  setSession(session: Session): this {
    this.session = session;
    return this;
  }

  /**
   * @override
   */
  async getRawInput(limit: number = 1024 * 1024 * 10, _timeout: number = 60000): Promise<Buffer> {
    return this.input.slice(0, limit);
  }
}
/**
 * This represent in fact a WebContext
 * In 3.0 an abstract version of Context will replace this (closer to OperationContext)
 * @category CoreFeatures
 *
 */
export class WebContext<T = any, U = any, P = any> extends OperationContext<T, U, P> {
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

  _executor: Service<any>;
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
    this.extensions["http"] = httpContext;
    this.reinit();
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
    return this.getHttpContext().getRawBody(limit, timeout);
  }

  /**
   * @override
   */
  getRawStream(): Readable {
    return this.getHttpContext().getRawStream();
  }

  /**
   * Get output headers
   */
  public getResponseHeaders(): any {
    return this._outputHeaders;
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
   * Set a header value
   *
   * @param {String} header name
   * @param {String} value
   */
  public setHeader(header, value) {
    if (this.headersFlushed) {
      throw new Error("Headers have been sent already");
    }
    if (value) {
      this._outputHeaders[header] = value;
    } else if (this._outputHeaders[header]) {
      delete this._outputHeaders[header];
    }
  }

  /**
   * Write the http return code and some headers
   * Those headers are not flushed yet so can still be overwritten
   *
   * @param {Number} statusCode to return to the client
   * @param {Object} headers to add to the response
   */
  writeHead(statusCode: number, headers: http.OutgoingHttpHeaders = undefined): this {
    this._outputHeaders = { ...this._outputHeaders, ...headers };
    // Ensure undefined values are removed
    Object.keys(this._outputHeaders)
      .filter(h => this._outputHeaders[h] === undefined)
      .forEach(h => delete this._outputHeaders[h]);
    if (statusCode !== undefined) {
      this.statusCode = statusCode;
    }
    return this;
  }

  /**
   *
   * @returns
   */
  getResponseCode() {
    return this.statusCode || 200;
  }

  /**
   * Redirect to another url
   * @param url
   */
  redirect(url: string) {
    this.writeHead(302, { Location: url });
  }
  /**
   * For compatibility reason
   */
  cookie(param, value, options = undefined) {
    /** @ignore */
    if (this._cookie === undefined) {
      this._cookie = new Map();
    }
    this._cookie[param] = { name: param, value, options };
  }

  getResponseCookies(): Map<string, Cookie> {
    return this._cookie;
  }

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
   */
  public status(code: number): this {
    this.statusCode = code;
    return this;
  }

  /**
   * Express response allow answer to be sent this way
   * @param code to return
   */
  public json(obj: any): this {
    this.write(obj);
    return this;
  }

  /**
   * Return the response size
   * @returns
   */
  getResponseSize(): number | undefined {
    return this._body ? Buffer.byteLength(this._body, "utf8") : undefined;
  }

  /**
   * Flush the request
   *
   * @emits 'finish' event
   * @throws Error if the request was already ended
   */
  async end() {
    /** @ignore */
    if (this._ended) {
      return this._ended;
    }
    this._ended = (async () => {
      this.emit("end");
      if (this.getExtension("http")) {
        await this._webda.getService<SessionManager>("SessionManager").save(this, this.session);
      }
      await Promise.all(this._promises);
      if (this._stream instanceof WritableStreamBuffer && (<WritableStreamBuffer>this._stream).size()) {
        this._body = (<WritableStreamBuffer>this._stream).getContents().toString();
        this.statusCode = this.statusCode < 300 ? 200 : this.statusCode;
      }
      if (!this.headersFlushed) {
        this._webda.flushHeaders(this);
      }
      this._webda.flush(this);
      this.emit("close");
    })();
    return this._ended;
  }

  /**
   * Alias to keep compatibility with WebContext
   * @param sanitizedOptions
   * @returns
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
   * @returns
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
   * @returns
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
   * Get a service from webda
   *
   * @see Webda
   * @param {String} name of the service
   */
  getService<K extends Service>(name): K {
    return this._webda.getService<K>(name);
  }

  /**
   * Get the HTTP stream to output raw data
   * @returns {*}
   */
  getStream() {
    return this.getOutputStream();
  }

  /**
   * Pipeline streams into the output stream
   *
   * @see https://nodejs.org/api/stream.html#streampipelinestreams-options
   */
  pipeline(stream1: NodeJS.ReadableStream, ...streams: Array<NodeJS.ReadWriteStream | PipelineOptions>): Promise<void> {
    const isPipelineOptions = (arg: NodeJS.ReadWriteStream | PipelineOptions): arg is PipelineOptions =>
      (arg as NodeJS.ReadWriteStream).writable === undefined;
    const item = streams.pop();
    if (isPipelineOptions(item)) {
      return pipeline([stream1, ...(<Array<NodeJS.ReadWriteStream>>streams), this.getOutputStream()], item);
    } else {
      return pipeline([stream1, ...(<Array<NodeJS.ReadWriteStream>>streams), this.getOutputStream()]);
    }
  }

  /**
   * Return the service handling the request
   */
  getExecutor(): Service<any> {
    return this._executor;
  }

  /**
   * Execute the target route
   */
  async execute() {
    return this._route._method(this);
  }

  /**
   * Get the request locale if found
   */
  getLocale() {
    const locales = this._webda.getLocales();
    acceptLanguage.languages(locales);
    const header = this.getHttpContext().getUniqueHeader("accept-language");
    if (header) {
      return acceptLanguage.get(header);
    }
    return locales[0];
  }

  /**
   * @ignore
   * Used by Webda framework to set the current route
   */
  setRoute(route) {
    this._route = route;
    this.parameters = { ...route.params, ...this.parameters };
  }

  getRoute() {
    return this._route;
  }
  /**
   * @param executor {object} Set the current executor for this context
   */
  setExecutor(executor) {
    this._executor = executor;
  }

  /**
   * @ignore
   * Used for compatibility with express module
   */
  logIn() {
    // Empty for compatibility
  }

  /**
   * Return true if Headers got flushed already
   * @returns
   */
  hasFlushedHeaders() {
    return this.headersFlushed;
  }

  /**
   * Set flushed header status
   * @param status
   */
  setFlushedHeaders(status: boolean = true) {
    this.headersFlushed = status;
  }

  /**
   * @ignore
   * Used by Webda framework to set the body, session and output stream if known
   */
  constructor(webda: Core, httpContext: HttpContext, stream: Writable = undefined) {
    super(webda, stream);
    this.setHttpContext(httpContext);
    this._outputHeaders = webda.getGlobalParams().defaultHeaders || {
      // Gotta Cache ‘em all: bending the rules of web cache exploitation
      // https://defcon.org/html/defcon-32/dc-32-speakers.html
      "Cache-Control": "private"
    };
    this.headersFlushed = false;
    this.statusCode = 204;
    this.headers = new Map();
  }

  async init(force: boolean = false): Promise<this> {
    if (this._init && !force) {
      return this._init;
    }
    this._stream.on("pipe", () => {
      this._webda.flushHeaders(this);
      this.headersFlushed = true;
    });
    if (this.getExtension("http")) {
      this.session = (await this._webda.getService<SessionManager>("SessionManager").load(this)).getProxy();
    }
    this._init = super.init();
    return this._init;
  }

  emitError(err) {
    this.emit("error", err);
  }
}
