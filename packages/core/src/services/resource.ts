import * as fs from "fs";
import * as mime from "mime";
import * as path from "path";
import { Context } from "../utils/context";
import { Service, ServiceParameters } from "./service";

export class ResourceServiceParameters extends ServiceParameters {
  url: string;
  folder: string;
  rootRedirect: boolean;
  _resolved: string;

  constructor(params: any) {
    super(params);
    this.url = this.url ?? "resources";
    this.rootRedirect = this.rootRedirect ?? false;
    if (!this.url.startsWith("/")) {
      this.url = "/" + this.url;
    }
    if (!this.url.endsWith("/")) {
      this.url += "/";
    }
    this.folder = this.folder ?? "." + this.url;
    if (!this.folder.endsWith("/")) {
      this.folder += "/";
    }
    this._resolved = path.resolve(this.folder);
  }
}

/**
 * @category CoreServices
 */
export default class ResourceService<T extends ResourceServiceParameters = ResourceServiceParameters> extends Service<
  T
> {
  /**
   * Load the parameters for a service
   */
  loadParameters(params: any): ResourceServiceParameters {
    return new ResourceServiceParameters(params);
  }

  initRoutes() {
    this._addRoute(this._params.url, ["GET"], this._serve, {
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
    this._addRoute(
      this._params.url + "{resource}",
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
    if (this._params.rootRedirect) {
      this._addRoute("/", ["GET"], this._redirect, {
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

  _redirect(ctx: Context) {
    ctx.redirect(ctx.getHttpContext().getAbsoluteUrl(this._params.url));
  }

  _serve(ctx: Context) {
    // TODO Add file only
    let resource = ctx.parameter("resource") || "index.html";
    let file = path.join(this._params.folder, resource);
    if (!path.resolve(file).startsWith(this._params._resolved)) {
      throw 401;
    }
    if (!fs.existsSync(file)) {
      throw 404;
    }
    ctx.writeHead(200, {
      "Content-Type": mime.getType(file) || "application/octet-stream"
    });
    ctx.write(fs.readFileSync(file));
    ctx.end();
  }
}

export { ResourceService };
