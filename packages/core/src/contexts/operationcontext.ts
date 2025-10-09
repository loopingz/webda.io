import { IOperationContext } from "./icontext.js";
import { Readable, Writable } from "stream";
import { WritableStreamBuffer } from "stream-buffers";
import { Session } from "../session/session.js";
import { NotEnumerable } from "@webda/tsc-esm";
import sanitize from "sanitize-html";
import { JSONUtils } from "@webda/utils";
import { useLog } from "../loggers/hooks.js";
import { runAsSystem } from "./execution.js";
import { IUser } from "../internal/iapplication.js";
import { useModelRepository } from "../core/hooks.js";

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
export class OperationContext<Input = any, Parameters = any, Output = any> extends IOperationContext<
  Input,
  Parameters,
  Output
> {
  /**
   * Session
   */
  protected session: Session;
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
  private user: IUser;

  parameters: Parameters;

  /**
   * @ignore
   * Used by Webda framework to set the body, session and output stream if known
   */
  constructor(stream: Writable = undefined) {
    super();
    this.extensions = {};
    this._promises = [];
    this._body = undefined;
    this._stream = stream;
    if (stream === undefined) {
      this.createStream();
    }
    this.parameters = <any>{};
  }

  /**
   * Set the session
   * @param session
   */
  setSession(session: Session): void {
    this.session = session;
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
  public getParameters(): Parameters {
    return this.parameters;
  }

  /**
   * Set the parameters
   */
  public setParameters(params: Parameters) {
    this.parameters = params;
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
   * Ensure the whole execution is finished
   */
  async end() {
    await Promise.all(this._promises);
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
  ): Promise<Input> {
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
      // TODO define this
      const { requestLimit, requestTimeout } = { requestLimit: 10 * 1024 * 1024, requestTimeout: 60000 };
      const data = await this.getRawInputAsString(requestLimit, requestTimeout);
      if (sanitizedOptions.raw === true) {
        return JSON.parse(data || sanitizedOptions.defaultValue);
      }
      if (!data || data.length === 0) {
        this._sanitized = sanitizedOptions.defaultValue;
        return this._sanitized;
      }
      this._sanitized = recursiveSanitize(JSON.parse(data), sanitizedOptions);
    } catch (err) {
      useLog("ERROR", err, `Body: '${await this.getRawInputAsString()}'`);
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
  async getOutputStream() {
    await this.flushHeaders();
    return this._stream;
  }

  /**
   * Get linked session
   * @returns
   */
  public getSession<K = Session>(): K {
    return <K>(<unknown>this.session);
  }

  newSession(): Session {
    this.session = new Session();
    return this.session;
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
  public write(output: Output, _encoding?: string, _cb?: (error: Error) => void): boolean {
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
  async getCurrentUser<K extends IUser>(refresh: boolean = false): Promise<K> {
    if (!this.getCurrentUserId()) {
      return undefined;
    }
    // Caching the answer
    if (!this.user || refresh) {
      await runAsSystem(async () => {
        this.user = <IUser>(<unknown>await useModelRepository("User").fromUID(this.getCurrentUserId()).get());
      });
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
}
