import * as fs from "fs";
import * as mime from "mime";
import * as path from "path";
import { Context } from "../utils/context";
import { Service } from "./service";

/**
 * @category CoreServices
 */
export default class ResourceService extends Service {
  _resolved: string;

  normalizeParams() {
    this._params.url = this._params.url || "resources";
    if (!this._params.url.startsWith("/")) {
      this._params.url = "/" + this._params.url;
    }
    if (!this._params.url.endsWith("/")) {
      this._params.url += "/";
    }

    this._params.folder = this._params.folder || "." + this._params.url;
    if (!this._params.folder.endsWith("/")) {
      this._params.folder += "/";
    }
    this._resolved = path.resolve(this._params.folder) + "/";
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
    let file = this._params.folder + resource;
    if (!path.resolve(file).startsWith(this._resolved)) {
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
