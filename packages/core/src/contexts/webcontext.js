import { OperationContext } from "./operationcontext.js";
import acceptLanguage from "accept-language";
import { Readable } from "node:stream";
import { WritableStreamBuffer } from "stream-buffers";
import { useCore, useService } from "../core/hooks.js";
/**
 * @category CoreFeatures
 */
class Cookie {
}
/**
 * This represent in fact a WebContext
 * In 3.0 an abstract version of Context will replace this (closer to OperationContext)
 * @category CoreFeatures
 *
 */
export class WebContext extends OperationContext {
    /**
     * Set current http context
     * @param httpContext current http context
     */
    setHttpContext(httpContext) {
        this.setExtension("http", httpContext);
        this.reinit();
    }
    /**
     * Get current http context
     */
    getHttpContext() {
        return this.getExtension("http");
    }
    /**
     * @override
     */
    async getRawInputAsString(limit = 1024 * 1024 * 10, timeout = 60000, encoding) {
        return this.getHttpContext().getRawBodyAsString(limit, timeout, encoding);
    }
    /**
     * @override
     */
    async getRawInput(limit = 1024 * 1024 * 10, timeout = 60000) {
        return (await this.getHttpContext().getRawBody(limit, timeout)) || Buffer.from("");
    }
    /**
     * @override
     */
    getRawStream() {
        return this.getHttpContext().getRawStream();
    }
    /**
     * Remove everything that was about to be sent
     */
    resetResponse() {
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
    write(output, encoding, cb) {
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
     */
    writeHead(statusCode, headers = undefined) {
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
     * @returns
     */
    getResponseCode() {
        return this.statusCode || 200;
    }
    /**
     * Redirect to another url
     * @param url
     */
    redirect(url) {
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
    getResponseCookies() {
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
    status(code) {
        this.statusCode = code;
        return this;
    }
    /**
     * Express response allow answer to be sent this way
     * @param code to return
     */
    json(obj) {
        this.write(obj);
        return this;
    }
    /**
     * Return the response size
     * @returns
     */
    getResponseSize() {
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
            if (this.getExtension("http")) {
                await useService("SessionManager").save(this, this.session);
            }
            await super.end();
            if (this._stream instanceof WritableStreamBuffer && this._stream.size()) {
                this._body = this._stream.getContents().toString();
                this.statusCode = this.statusCode < 300 ? 200 : this.statusCode;
            }
            // TODO Handle the case where the headers were not flushed
        })();
        return this._ended;
    }
    /**
     * Alias to keep compatibility with WebContext
     * @param sanitizedOptions
     * @returns
     */
    async getRequestBody(sanitizedOptions = {
        allowedTags: [],
        allowedAttributes: {}
    }) {
        return this.getInput(sanitizedOptions);
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
    getRequest() {
        const stream = Readable.from([JSON.stringify(this.getRequestBody())]);
        return {
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
     * Get the request locale if found
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
     * @returns
     */
    hasFlushedHeaders() {
        return this.headersFlushed;
    }
    /**
     * Set flushed header status
     * @param status
     */
    setFlushedHeaders(status = true) {
        this.headersFlushed = status;
    }
    /**
     * @ignore
     * Used by Webda framework to set the body, session and output stream if known
     */
    constructor(httpContext, stream = undefined, defaultHeaders = undefined) {
        super(stream);
        this._ended = undefined;
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
    async init(force = false) {
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
//# sourceMappingURL=webcontext.js.map