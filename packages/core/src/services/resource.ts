import * as fs from "fs";
import * as mime from "mime-types";
import * as path from "path";
import { ModdaDefinition } from "..";
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
  }
}

/**
 * This service expose a folder as web
 *
 * It is the same as `static` on `express`
 *
 * @category CoreServices
 */
export default class ResourceService<
  T extends ResourceServiceParameters = ResourceServiceParameters
> extends Service<T> {
  /**
   * Resolved path to the folder to serve
   */
  _resolved: string;

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
          "200": "",
          "401": "Illegal resource",
          "404": "File not found"
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
            "200": "",
            "401": "Illegal resource",
            "404": "File not found"
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
            "302": ""
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
    // TODO Add file only
    let resource = ctx.parameter("resource") || "index.html";
    let file = path.join(this.parameters.folder, resource);
    if (!path.resolve(file).startsWith(this._resolved)) {
      throw 401;
    }
    if (!fs.existsSync(file)) {
      throw 404;
    }
    ctx.writeHead(200, {
      "Content-Type": mime.lookup(file) || "application/octet-stream"
    });
    ctx.write(fs.readFileSync(file));
    ctx.end();
  }

  /**
   * @inheritdoc
   */
   static getModda(): ModdaDefinition {
    return {
      uuid: "Webda/ResourceService",
      label: "Resources Service",
      description: "Serve a static directory"
    };
  }
}

export { ResourceService };
