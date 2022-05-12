import { WorkerLogLevel } from "@webda/workout";
import * as acceptLanguage from "accept-language";
import { EventEmitter } from "events";
import * as http from "http";
import * as sanitizeHtml from "sanitize-html";
import { Writable } from "stream";
import { Core } from "../core";
import { User } from "../models/user";
import { Service } from "../services/service";
import { Store } from "../stores/store";
import { SessionCookie } from "../utils/cookie";
import { HttpContext } from "./httpcontext";
import { JSONUtils } from "./serializers";

/**
 * @category CoreFeatures
 */
export class ClientInfo extends Map<string, any> {
  ip: string;
  userAgent: string;
  locale: string;
  referer: string;
}

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
  clientInfo: ClientInfo;
  protected _body: any;
  protected _outputHeaders: Map<string, string>;
  protected _webda: Core;
  statusCode: number;
  _cookie: Map<string, Cookie>;
  headers: Map<string, string>;
  _route: any;
  _buffered: boolean;
  protected session: SessionCookie;
  _ended: Promise<any> = undefined;
  _stream: any;
  _promises: Promise<any>[];
  _executor: Service<any>;
  _flushHeaders: boolean;
  _sanitized: any;
  protected parameters: any = undefined;
  protected _pathParams: any = {};
  protected _serviceParams: any = {};
  files: any[];
  protected static __globalContext: Context;
  private global: boolean = false;
  /**
   * Allow extensions
   */
  protected extensions: { [key: string]: any };
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

  public isGlobal() {
    return this.global;
  }
  /**
   * @private
   * Used in case of Buffer response ( like Lambda )
   */
  public _write(chunk, _enc, next) {
    if (this._body === undefined) {
      this._body = [];
    }
    this._body.push(chunk);
    next();
    return true;
  }

  /**
   * Set current http context
   * @param httpContext current http context
   */
  public setHttpContext(httpContext: HttpContext) {
    this.extensions["http"] = httpContext;
    this.reinit();
  }

  public reinit() {
    this._sanitized = undefined;
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

  public getSession() {
    if (this.session) {
      return this.session.getProxy();
    }
    return undefined;
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

  public resetResponse() {
    this._body = undefined;
    this._outputHeaders.clear();
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
      await Promise.all(this._promises);
      if (this._buffered && this._stream._body !== undefined) {
        this._body = Buffer.concat(this._stream._body);
        this.statusCode = 200;
      }
      if (!this._flushHeaders) {
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
      if (!obj) {
        return obj;
      }
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
      this._sanitized = recursiveSanitize(JSON.parse(await this.getHttpContext().getRawBody()), sanitizedOptions) || {};
    } catch (err) {
      this.log("ERROR", err, this.getHttpContext().getRawBody());
      return undefined;
    }
    return this._sanitized;
  }

  getResponseBody() {
    return this._body;
  }

  /**
   * Retrieve a http.IncomingMessage valid from Context
   *
   * Need more testing
   * @returns
   */
  getRequest(): http.IncomingMessage {
    const s = require("stream");
    var stream = s.Readable.from([JSON.stringify(this.getRequestBody())]);
    return <http.IncomingMessage>{
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
    };
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
      return this.session.getUserId();
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
    let headers = this.getHttpContext().getHeaders();
    if (headers["Accept-Language"]) {
      return acceptLanguage.get(headers["Accept-Language"]);
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
    return this._flushHeaders;
  }

  /**
   * Set flushed header status
   * @param status
   */
  setFlushedHeaders(status: boolean = true) {
    this._flushHeaders = status;
  }

  /**
   * @ignore
   * Used by Webda framework to set the body, session and output stream if known
   */
  constructor(webda: Core, httpContext: HttpContext, stream: any = undefined) {
    super();
    this.clientInfo = new ClientInfo();
    this.extensions = {
      http: httpContext
    };
    this._webda = webda;
    this._promises = [];
    this._outputHeaders = new Map();
    this._flushHeaders = false;
    this._body = undefined;
    this.statusCode = 204;
    this._stream = stream;
    this._buffered = false;
    this.parameters = {};
    this.headers = new Map();
    if (stream === undefined) {
      this._stream = new Writable();
      this._stream._body = [];
      this._stream._write = this._write;
    }
    this.processParameters();
    if (httpContext) {
      this.session = this.newSession();
    }
  }

  newSession() {
    this.session = new (this._webda.getModel(this._webda.parameter("sessionModel") || "Webda/SessionCookie"))(this);
    return this.session;
  }

  async init(): Promise<this> {
    this._stream.on("pipe", () => {
      this._buffered = true;
      this._webda.flushHeaders(this);
    });
    await this.session.init();
    return this;
  }

  emitError(err) {
    this.emit("error", err);
  }
}

class StoreSessionContext extends Context {}
class CookieSessionContext extends Context {}
