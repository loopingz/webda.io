import { WorkerLogLevel } from "@webda/workout";
import acceptLanguage from "accept-language";
import { EventEmitter } from "events";
import * as http from "http";
import sanitizeHtml from "sanitize-html";
import { Readable, Writable } from "stream";
import { WritableStreamBuffer } from "stream-buffers";
import { Core } from "../core";
import { User } from "../models/user";
import { Service } from "../services/service";
import { Store } from "../stores/store";
import { Session, SessionManager } from "../utils/session";
import { HttpContext } from "./httpcontext";
import { JSONUtils } from "./serializers";

/**
 * @category CoreFeatures
 */
class Cookie {
  name: string;
  value: string;
  options: any;
}

/**
 * @category CoreFeatures
 * @WebdaModel
 */
export class Context<T = any, U = any> extends EventEmitter {
  protected _body: any;
  /**
   * Contains the response headers
   */
  protected _outputHeaders: Map<string, string>;
  /**
   * Contain emitting Core
   */
  protected _webda: Core;
  /**
   * Current status code
   */
  statusCode: number;
  _cookie: Map<string, Cookie>;
  /**
   *
   */
  headers: Map<string, string>;
  _route: any;
  /**
   * Session
   */
  protected session: Session;
  _ended: Promise<any> = undefined;
  _stream: Writable;
  /**
   * Contain all registered promises to this context
   */
  _promises: Promise<any>[];
  _executor: Service<any>;
  /**
   * If headers were flushed
   */
  protected headersFlushed: boolean;
  /**
   * Contain the sanitized request body if computed
   */
  protected _sanitized: any;
  protected parameters: any = undefined;
  protected _pathParams: any = {};
  protected _serviceParams: any = {};
  protected static __globalContext: Context;
  private global: boolean = false;
  /**
   * Allow extensions
   */
  protected extensions: { [key: string]: any };
  /**
   * Loaded user if exist
   */
  private user: User;

  /**
   * Get Global Context
   */
  public static getGlobalContext() {
    return Context.__globalContext;
  }

  /**
   * Set the Global Context
   *
   * @param ctx to set as Global
   */
  public static setGlobalContext(ctx: Context) {
    ctx.global = true;
    Context.__globalContext = ctx;
  }

  /**
   * Return if context is global
   */
  public isGlobal() {
    return this.global;
  }

  /**
   * Set current http context
   * @param httpContext current http context
   */
  public setHttpContext(httpContext: HttpContext) {
    this.extensions["http"] = httpContext;
    this.reinit();
  }

  /**
   * Remove samitized body
   */
  public reinit() {
    this._sanitized = undefined;
    this.createStream();
  }

  /**
   * Get current http context
   */
  public getHttpContext() {
    return this.getExtension<HttpContext>("http");
  }

  /**
   * Get an extension of the context
   * @param name of the extension
   * @returns extension object
   */
  public getExtension<K = any>(name: string): K {
    return <K>this.extensions[name];
  }

  /**
   *
   * @param name to add
   * @param extension object to store
   */
  public setExtension(name: string, extension: any): void {
    this.extensions[name] = extension;
  }

  /**
   * Get output headers
   */
  public getResponseHeaders(): any {
    return this._outputHeaders;
  }

  public getRequestParameters() {
    return this.parameters;
  }

  public parameter(name: string) {
    return this.getParameters()[name];
  }

  public getParameters() {
    return this.parameters;
  }

  private processParameters() {
    this.parameters = Object.assign({}, this._serviceParams);
    this.parameters = Object.assign(this.parameters, this._pathParams);
  }

  /**
   * Get linked session
   * @returns
   */
  public getSession<K = Session>(): K {
    return <K>(<unknown>this.session);
  }

  public getServiceParameters() {
    return this._serviceParams;
  }

  public getPathParameters() {
    return this._pathParams;
  }

  public setServiceParameters(params: any) {
    this._serviceParams = params;
    this.processParameters();
  }

  public setPathParameters(params: any) {
    this._pathParams = params;
    this.processParameters();
  }

  /**
   * Remove everything that was about to be sent
   */
  public resetResponse() {
    this._body = undefined;
    this._outputHeaders.clear();
    if (this._stream instanceof WritableStreamBuffer) {
      this.createStream();
    }
  }

  /**
   * Write data to the client
   *
   * @param output If it is an object it will be serializeb with toPublicJSON, if it is a String it will be appended to the result, if it is a buffer it will replace the result
   * @param ...args any arguments to pass to the toPublicJSON method
   */
  // @ts-ignore
  public write(output: U, _encoding?: string, _cb?: (error: Error) => void): boolean {
    if (this.statusCode === 204) {
      this.statusCode = 200;
    }
    if (typeof output === "object" && !(output instanceof Buffer)) {
      this.setHeader("Content-type", "application/json");
      this._body = JSONUtils.stringify(output, undefined, 0, true);
      return true;
    } else if (typeof output == "string") {
      if (this._body == undefined) {
        this._body = "";
      }
      this._body += output;
      return true;
    } else {
      this._body = output;
    }
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
    this._outputHeaders[header] = value;
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
    if (statusCode !== undefined) {
      this.statusCode = statusCode;
    }
    return this;
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

  addAsyncRequest(promise) {
    this._promises.push(promise);
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
   * Express response allow statusCode to be defined this was
   * @param code to return
   */
  public status(code: number): this {
    this.statusCode = code;
    return this;
  }

  /**
   * Express response allow answer to be sent this w
   * @param code to return
   */
  public json(obj: any): this {
    this.write(obj);
    return this;
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
    this._ended = new Promise<void>(async resolve => {
      this.emit("end");
      if (this.getExtension("http")) {
        await this._webda.getService<SessionManager>("SessionManager").save(this, this.session);
      }
      await Promise.all(this._promises);
      if (this._stream instanceof WritableStreamBuffer && this._stream.size()) {
        this._body = this._stream.getContents();
        this.statusCode = 200;
      }
      if (!this.headersFlushed) {
        this._webda.flushHeaders(this);
      }
      this._webda.flush(this);
      this.emit("close");
      resolve();
    });
    return this._ended;
  }

  async getRequestBody(
    sanitizedOptions: any = {
      allowedTags: [],
      allowedAttributes: {}
    }
  ): Promise<T> {
    if (this._sanitized) {
      return this._sanitized;
    }
    let recursiveSanitize = (obj, options = undefined) => {
      if (typeof obj === "string") {
        return sanitizeHtml(obj, options);
      }
      if (typeof obj === "object") {
        Object.keys(obj).forEach(key => {
          obj[key] = recursiveSanitize(obj[key], options);
        });
      }
      return obj;
    };
    try {
      this._sanitized = recursiveSanitize(
        JSON.parse(
          await this.getHttpContext().getRawBodyAsString(
            this.getWebda().getGlobalParams().requestLimit,
            this.getWebda().getGlobalParams().requestTimeout
          )
        ),
        sanitizedOptions
      );
    } catch (err) {
      this.log("ERROR", err, `Body: '${await this.getHttpContext().getRawBodyAsString()}'`);
      return undefined;
    }
    return this._sanitized;
  }

  /**
   * Get request body
   * @returns
   */
  getResponseBody() {
    if (!this._body && this._stream instanceof WritableStreamBuffer) {
      return this._stream.getContents();
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
    return this._stream;
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
      this.user = await this._webda.getService<Store<K, any>>("Users").get(this.getCurrentUserId());
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
   * Return the service handling the request
   */
  getExecutor(): Service<any> {
    return this._executor;
  }

  /**
   * Execute the target route
   */
  async execute() {
    if (this.getExecutor() && typeof this._route._method === "function") {
      return Promise.resolve(this.getExecutor()[this._route._method.name](this));
    }
    return Promise.reject(Error("Not implemented"));
  }

  /**
   * Return the webda
   */
  getWebda() {
    return this._webda;
  }

  /**
   * Get the request locale if found
   */
  getLocale() {
    let locales = this._webda.getLocales();
    acceptLanguage.languages(locales);
    let header = this.getHttpContext().getUniqueHeader("accept-language");
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
   * Proxy for simplification
   * @param level
   * @param args
   */
  log(level: WorkerLogLevel, ...args: any[]) {
    this._webda.log(level, ...args);
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
    super();
    this.extensions = {
      http: httpContext
    };
    this._webda = webda;
    this._promises = [];
    this._outputHeaders = new Map();
    this.headersFlushed = false;
    this._body = undefined;
    this.statusCode = 204;
    this._stream = stream;
    this.parameters = {};
    this.headers = new Map();
    if (stream === undefined) {
      this.createStream();
    }
    this.processParameters();
    if (httpContext) {
      this.session = this.newSession();
    }
  }

  createStream() {
    this._stream = new WritableStreamBuffer({
      initialSize: 100 * 1024,
      incrementAmount: 100 * 1024
    });
  }

  /**
   * Create a new session
   * @returns
   */
  newSession() {
    this.session = new (this._webda.getModel(this._webda.parameter("sessionModel") || "Webda/Session"))(this);
    return this.session;
  }

  async init(): Promise<this> {
    this._stream.on("pipe", () => {
      this._webda.flushHeaders(this);
      this.headersFlushed = true;
    });
    if (this.getExtension("http")) {
      this.session = (await this._webda.getService<SessionManager>("SessionManager").load(this)).getProxy();
    }
    return this;
  }

  emitError(err) {
    this.emit("error", err);
  }
}
