import * as fs from "fs";
import * as mime from "mime-types";
import * as path from "path";
import { Context } from "../utils/context";
import { Service, ServiceParameters } from "./service";

/**
 * ResourceService parameters
 */
export class ResourceServiceParameters extends ServiceParameters {
  /**
   * URL on which to serve the content
   *
   * @default "resources"
   */
  url?: string;
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
  catchAll?: boolean;

  constructor(params: any) {
    super(params);
    this.url ??= "resources";
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
    this.catchAll ??= true;
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
export default class ResourceService<
  T extends ResourceServiceParameters = ResourceServiceParameters
> extends Service<T> {
  /**
   * Resolved path to the folder to serve
   */
  _resolved: string;
  /**
   * If serving just one file
   */
  fileOnly: boolean;

  /**
   * Load the parameters for a service
   */
  loadParameters(params: any): ResourceServiceParameters {
    return new ResourceServiceParameters(params);
  }

  /**
   * Resolve resource folder
   */
  computeParameters() {
    super.computeParameters();
    this._resolved = path.resolve(this.parameters.folder);
    this.fileOnly = !fs.lstatSync(this._resolved).isDirectory();
  }

  /**
   * Init the routes
   */
  initRoutes() {
    this.addRoute(this.parameters.url, ["GET"], this._serve, {
      get: {
        description: "Get resources",
        summary: "Get file",
        operationId: "getResource",
        responses: {
          "200": {
            description: ""
          },
          "401": {
            description: "Illegal resource"
          },
          "404": {
            description: "File not found"
          }
        }
      }
    });
    this.addRoute(
      this.parameters.url + "{resource}",
      ["GET"],
      this._serve,
      {
        get: {
          description: "Get resources",
          summary: "Get file",
          operationId: "getResources",
          responses: {
            "200": {
              description: ""
            },
            "401": {
              description: "Illegal resource"
            },
            "404": {
              description: "File not found"
            }
          }
        }
      },
      true
    );
    if (this.parameters.rootRedirect) {
      this.addRoute("/", ["GET"], this._redirect, {
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
  }

  /**
   * Handle / request and redirect to the resources folder
   *
   * @param ctx
   */
  _redirect(ctx: Context) {
    ctx.redirect(ctx.getHttpContext().getAbsoluteUrl(this.parameters.url));
  }

  /**
   * Serve the folder by itself, doing the mime detection
   *
   * @param ctx
   */
  _serve(ctx: Context) {
    let file = this._resolved;
    // If resource is not a file
    if (!this.fileOnly) {
      file = path.join(this._resolved, ctx.parameter("resource") || this.parameters.index);
    }

    // Avoid path transversal
    if (!path.resolve(file).startsWith(this._resolved)) {
      throw 401;
    }

    if (!fs.existsSync(file)) {
      // Catch All for SPA
      if (this.parameters.catchAll) {
        file = path.join(this._resolved, this.parameters.index);
      } else {
        throw 404;
      }
    }
    let mimetype = mime.lookup(file) || "application/octet-stream";
    if (mimetype.startsWith("text/")) {
      mimetype += "; charset=UTF-8";
    }
    ctx.writeHead(200, {
      "Content-Type": mimetype
    });
    ctx.write(fs.readFileSync(file));
    ctx.end();
  }
}

export { ResourceService };
