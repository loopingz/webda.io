import { Context } from "../index";
import { ServiceParameters, Service } from "./service";

export class EchoServiceParameters extends ServiceParameters {
  /**
   * Mime of the result
   */
  mime?: string;
  /**
   * result to write on the url
   */
  result: string | any;
  /**
   * Url to expose the service
   */
  url: string;
}

/**
 * Return a static string with a static route
 *
 * Useful for version display
 * {@VersionService} is a shortcut for this
 *
 * ```javascript
 * "Version": {
 *  "type": "Webda/EchoService",
 *  "result": "${package.version}",
 *  "url": "/version",
 *  "mime": "text/plain"
 * }
 * ```
 * @WebdaModda
 */
export class EchoService extends Service<EchoServiceParameters> {
  /**
   * Load parameters
   *
   * @param params
   * @ignore
   */
  loadParameters(params: any): ServiceParameters {
    return new EchoServiceParameters(params);
  }

  /** @ignore */
  initRoutes() {
    this.addRoute(this.parameters.url, ["GET"], this.execute);
  }

  /** @ignore */
  async execute(ctx: Context): Promise<any> {
    if (this.parameters.mime) {
      ctx.writeHead(200, {
        "Content-Type": this.parameters.mime
      });
    }
    if (typeof this.parameters.result != "string") {
      ctx.write(JSON.stringify(this.parameters.result));
    } else {
      ctx.write(this.parameters.result);
    }
  }
}
