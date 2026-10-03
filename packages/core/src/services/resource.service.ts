import * as fs from "fs";
import * as mime from "mime-types";
import * as path from "path";
import * as WebdaError from "../errors/errors.js";
import type { IWebContext } from "../contexts/icontext.js";
import { Route } from "../rest/irest.js";
import { Service } from "./service.js";
import { ServiceParameters } from "../services/serviceparameters.js";

/**
 * ResourceService parameters
 */
export class ResourceServiceParameters extends ServiceParameters {
  /**
   * URL on which to serve the content
   *
   * @default "resources"
   */
  declare url?: string;
  /**
   * Folder to server
   *
   * @default "." + url
   */
  folder?: string;
  /**
   * Add the / root to redirect to /{url}
   *
   * @default false
   */
  rootRedirect?: boolean;
  /**
   * Index file
   *
   * @default index.html
   */
  index?: string;
  /**
   * Return the index file for any unfound resource
   * Useful for single page application
   *
   * @default true
   */
  indexFallback?: boolean;
  /**
   * Cache control header to set
   * @default "public, max-age=31536000"
   */
  cacheControl?: string;
  /**
   * Cache control for index file
   * SPA usually do not cache the index file
   *
   * @default "no-cache, no-store, must-revalidate"
   */
  indexCacheControl?: string;
  /**
   * Serve also . prefixed files
   * . files usually have some secrets and should not be served
   *
   * @default false
   */
  allowHiddenFiles?: boolean;

  /** Create a new ResourceServiceParameters
   * @param params - the raw parameters
   */
  constructor(params?: any) {
    super();
    if (params) {
      this.load(params);
    }
  }

  /**
   * Load parameters, applying defaults and normalizing `url` and `folder`.
   * The application builds parameters as `new Parameters().load(config)`, so
   * this has to happen here rather than in the constructor.
   * @param params - the raw parameters
   * @returns this for chaining
   */
  load(params: any = {}): this {
    super.load(params);
    this.url ??= "resources";
    this.cacheControl ??= "public, max-age=31536000";
    this.indexCacheControl ??= "no-cache, no-store, must-revalidate";
    this.rootRedirect ??= false;
    if (!this.url.startsWith("/")) {
      this.url = "/" + this.url;
    }
    if (!this.url.endsWith("/")) {
      this.url += "/";
    }
    this.folder ??= "." + this.url;
    if (!this.folder.endsWith("/")) {
      this.folder += "/";
    }
    this.index ??= "index.html";
    this.indexFallback ??= true;
    this.allowHiddenFiles ??= false;
    return this;
  }
}

/**
 * This service expose a folder as web
 *
 * It is the same as `static` on `express`
 *
 * @category CoreServices
 * @WebdaModda
 */
class ResourceService<T extends ResourceServiceParameters = ResourceServiceParameters> extends Service<T> {
  /**
   * Resolved path to the folder to serve
   */
  _resolved: string;
  /**
   * If serving just one file
   */
  fileOnly: boolean;

  /**
   * Resolve resource folder
   * @returns the result
   */
  resolve() {
    super.resolve();
    this.parameters.with(({ folder }) => {
      this._resolved = path.resolve(folder);
      this.fileOnly = !fs.lstatSync(this._resolved).isDirectory();
    });
    return this;
  }

  /**
   * Register the optional rootRedirect route — kept programmatic because
   * it's conditional on `parameters.rootRedirect`.
   *
   * @returns this for chaining
   */
  async init(): Promise<this> {
    await super.init();
    // A folder is served at `url` with its trailing slash; send the bare URL
    // there, where relative links in the index (`app.js`) resolve inside it
    if (!this.fileOnly && this.parameters.url !== "/") {
      this.addRoute(this.parameters.url.slice(0, -1), ["GET"], this._redirectToFolder, {
        hidden: true,
        get: {
          description: "Redirect to the exposed folder with its trailing slash",
          summary: "Redirect to resources",
          operationId: "redirectToResources",
          responses: {
            "302": {
              description: ""
            }
          }
        }
      });
    }
    if (this.parameters.rootRedirect) {
      this.addRoute("/", ["GET"], this._redirect, {
        hidden: true,
        get: {
          description: "Redirect / to the exposed url",
          summary: "Serve resource",
          operationId: "redirectRoottoResources",
          responses: {
            "302": {
              description: ""
            }
          }
        }
      });
    }
    return this;
  }

  /**
   * Handle / request and redirect to the resources folder
   *
   * @param ctx - the operation context
   */
  _redirect(ctx: IWebContext) {
    ctx.setHeader("cache-control", this.parameters.cacheControl);
    ctx.redirect(ctx.getHttpContext().getAbsoluteUrl(this.parameters.url));
  }

  /**
   * Handle the folder URL without its trailing slash
   *
   * @param ctx - the operation context
   */
  _redirectToFolder(ctx: IWebContext) {
    const http = ctx.getHttpContext();
    ctx.redirect(http.getAbsoluteUrl(this.parameters.url + http.getSearch()));
  }

  /**
   * Serve the folder by itself, doing the mime detection
   *
   * @param ctx - the operation context
   * @returns the result
   */
  @Route(".", ["GET"], {
    hidden: true,
    get: {
      description: "Get resources",
      summary: "Get file",
      operationId: "getResource",
      responses: {
        "200": { description: "" },
        "401": { description: "Illegal resource" },
        "404": { description: "File not found" }
      }
    }
  })
  @Route("./{+resource}", ["GET"], {
    hidden: true,
    get: {
      description: "Get resources",
      summary: "Get file",
      operationId: "getResources",
      responses: {
        "200": { description: "" },
        "401": { description: "Illegal resource" },
        "404": { description: "File not found" }
      }
    }
  })
  _serve(ctx: IWebContext) {
    let file = this._resolved;
    let cacheControl = this.parameters.cacheControl;
    // If resource is not a file
    if (!this.fileOnly) {
      file = path.join(this._resolved, ctx.parameter("resource") || this.parameters.index);
      if (!ctx.parameter("resource")) {
        cacheControl = this.parameters.indexCacheControl;
      } else if (
        ctx
          .parameter("resource")
          .split("/")
          .find(f => f.startsWith(".")) &&
        !this.parameters.allowHiddenFiles
      ) {
        throw new WebdaError.NotFound("Hidden files are not allowed");
      }
    }

    // Avoid path transversal
    if (!path.resolve(file).startsWith(this._resolved)) {
      throw new WebdaError.Unauthorized(file);
    }

    if (!fs.existsSync(file)) {
      file = path.join(this._resolved, this.parameters.index);
      // Catch All for SPA
      if (!(this.parameters.indexFallback && fs.existsSync(file))) {
        throw new WebdaError.NotFound(file);
      }
      cacheControl = this.parameters.indexCacheControl;
    }
    let mimetype = mime.lookup(file) || "application/octet-stream";
    if (mimetype.startsWith("text/")) {
      mimetype += "; charset=UTF-8";
    }
    ctx.writeHead(200, {
      "content-type": mimetype,
      "content-length": fs.lstatSync(file).size,
      "cache-control": cacheControl
    });
    // We could cache in memory some of the file to avoid I/O
    return ctx.pipeline(fs.createReadStream(file));
  }
}

export { ResourceService };
