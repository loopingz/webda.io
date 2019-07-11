"use strict";
import { Writable } from "stream";
import {
  _extend,
  Core as Webda,
  Executor,
  SessionCookie,
  Store,
  User,
  Service
} from "../index";
import * as acceptLanguage from "accept-language";
import { parse as cookieParse } from "cookie";
import { EventEmitter } from "events";

class ClientInfo extends Map<string, any> {
  ip: string;
  userAgent: string;
  locale: string;
  referer: string;
}

class HttpContext {
  host: string;
  method: string;
  uri: string;
  protocol: string;
  port: number;
  headers: any;
  root: string;
  origin: string;
  body: any;
  cookies: any;
  files: any[];

  constructor(
    host: string,
    method: string,
    uri: string,
    protocol: string = "http",
    port: number = 80,
    body: any = {},
    headers: any = {},
    files: any[] = []
  ) {
    this.files = files;
    this.body = body;
    this.host = host;
    this.method = method;
    this.uri = uri;
    this.protocol = protocol;
    this.port = port;
    this.headers = headers;
    for (let i in this.headers) {
      if (i.toLowerCase() === "cookie") {
        this.cookies = cookieParse(this.headers[i]);
      }
    }
    let portUrl = "";
    if (port !== undefined && port !== 80 && protocol === "http") {
      portUrl = ":" + port;
    } else if (port !== undefined && port !== 443 && protocol === "https") {
      portUrl = ":" + port;
    }
    this.root = this.protocol + "://" + this.host + portUrl;
    this.origin = this.host + portUrl;
  }

  getUrl() {
    return this.uri;
  }

  getCookies() {
    return this.cookies;
  }

  getPort() {
    return this.port;
  }

  getHost() {
    return this.host;
  }

  getMethod() {
    return this.method;
  }

  getProtocol() {
    return this.protocol;
  }

  getBody() {
    return this.body;
  }

  getHeaders() {
    return this.headers;
  }

  setBody(body) {
    this.body = body;
  }

  getFullUrl(uri: string = this.uri) {
    return this.protocol + "://" + this.host + uri;
  }
}

class Cookie {
  name: string;
  value: string;
  options: any;
}

class Context extends EventEmitter {
  clientInfo: ClientInfo;
  private _body: any;
  private _outputHeaders: Map<string, string>;
  private _webda: Webda;
  statusCode: number;
  _cookie: Map<string, Cookie>;
  headers: Map<string, string>;
  _route: any;
  _buffered: boolean;
  private session: SessionCookie;
  _ended: Promise<any> = undefined;
  _stream: any;
  _promises: Promise<any>[];
  _executor: Executor;
  _flushHeaders: boolean;
  private body: any;
  private _params: any = undefined;
  private _pathParams: any;
  private _serviceParams: any;
  files: any[];
  private _http: HttpContext;

  /**
   * @private
   * Used in case of Buffer response ( like Lambda )
   */
  protected _write(chunk, enc, next) {
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
    this._http = httpContext;
  }

  /**
   * Get current http context
   */
  public getHttpContext() {
    return this._http;
  }

  /**
   * Get output headers
   */
  public getResponseHeaders(): any {
    return this._outputHeaders;
  }

  public getRequestParameters() {
    return this._params;
  }

  public parameter(name: string) {
    return this.getParameters()[name];
  }

  public getParameters() {
    return this._params;
  }

  private processParameters() {
    this._params = Object.assign({}, this._serviceParams);
    this._params = Object.assign(this._params, this._pathParams);
  }

  public getSession() {
    return this.session.getProxy();
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
  public write(output) {
    if (typeof output === "object" && !(output instanceof Buffer)) {
      this._outputHeaders["Content-type"] = "application/json";
      // @ts-ignore
      global.WebdaContext = this;
      try {
        this._body = JSON.stringify(output);
      } finally {
        // @ts-ignore
        global.WebdaContext = undefined;
      }
      return;
    } else if (typeof output == "string") {
      if (this._body == undefined) {
        this._body = "";
      }
      this._body += output;
      return;
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
   * @param {Number} httpCode to return to the client
   * @param {Object} headers to add to the response
   */
  writeHead(httpCode, headers) {
    _extend(this._outputHeaders, headers);
    if (httpCode !== undefined) {
      this.statusCode = httpCode;
    }
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
   *
   * @todo Implement the serialization
   * Not yet handle by the Webda framework
   */
  cookie(param, value, options) {
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
    this.emit("end");
    await Promise.all(this._promises);
    if (this._buffered && this._stream._body !== undefined) {
      this._body = Buffer.concat(this._stream._body);
    }
    if (!this._flushHeaders) {
      this._flushHeaders = true;
      if (this._body !== undefined && this.statusCode == 204) {
        this.statusCode = 200;
      }
      this._webda.flushHeaders(this);
    }
    this._webda.flush(this);
    return this._ended;
  }

  getRequestBody() {
    return this.getHttpContext().getBody();
  }

  getResponseBody() {
    return this._body;
  }

  /**
   * Get a service from webda
   *
   * @see Webda
   * @param {String} name of the service
   */
  getService(name): Service {
    return this._webda.getService(name);
  }

  /**
   * Get a service from webda
   *
   * @see Webda
   * @param {String} name of the service
   */
  getTypedService<T extends Service>(name): T {
    return <T>this._webda.getService(name);
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
  async getCurrentUser(): Promise<User> {
    if (!this.getCurrentUserId()) {
      return undefined;
    }
    return (<Store<User>>this._webda.getService("Users")).get(
      this.getCurrentUserId()
    );
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
    this._params = _extend(this._params, route.params);
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
  logIn() {}

  /**
   * @ignore
   * Used by Webda framework to set the body, session and output stream if known
   */
  constructor(webda: Webda, httpContext: HttpContext, stream: any = undefined) {
    super();
    this.clientInfo = new ClientInfo();
    this._http = httpContext;
    this._webda = webda;
    this._promises = [];
    this._outputHeaders = new Map();
    this._flushHeaders = false;
    this._body = undefined;
    this.statusCode = 204;
    this._stream = stream;
    this._buffered = false;
    this._params = {};
    this.headers = new Map();
    if (stream === undefined) {
      this._stream = new Writable();
      this._stream._body = [];
      this._stream._write = this._write;
    }
    this.processParameters();
    this.session = this.newSession();
  }

  newSession() {
    this.session = new (this._webda.getModel(
      this._webda.parameter("sessionModel") || "WebdaCore/SessionCookie"
    ))(this);
    return this.session;
  }

  async init() {
    this._stream.on("pipe", () => {
      this._flushHeaders = true;
      this._buffered = true;
      this._webda.flushHeaders(this);
    });
    await this.session.init();
  }
}

class StoreSessionContext extends Context {}
class CookieSessionContext extends Context {}

export { Context, ClientInfo, HttpContext };
