import { Route, Service, ServiceParameters, WebContext } from "@webda/core";

/**
 * Configuration for EchoService — static content served on a fixed route
 */
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
 *  "result": "1.0.0",
 *  "url": "/version",
 *  "mime": "text/plain"
 * }
 * ```
 * @WebdaModda
 */
export class EchoService extends Service<EchoServiceParameters> {
  /** Service parameters */
  static Parameters = EchoServiceParameters;
  /** @ignore */
  @Route(".", ["GET"])
  async execute(ctx: WebContext): Promise<any> {
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
