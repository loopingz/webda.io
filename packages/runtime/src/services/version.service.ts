import { OperationContext, Route, Service, ServiceParameters, useApplication } from "@webda/core";

/**
 * Version parameters
 */
export class VersionServiceParameters extends ServiceParameters {
  /**
   * To force version otherwise would read from package.json
   */
  version?: string;
  /**
   * URL
   * @default /version
   */
  url?: string;
}

/**
 * Display the version of the app on a route
 * @WebdaModda VersionService
 */
export class VersionService<T extends VersionServiceParameters = VersionServiceParameters> extends Service<T> {
  /** Service parameters */
  static Parameters = VersionServiceParameters;
  /**
   * Set defaults for version and url from the application's package.json
   * @returns this instance for chaining
   */
  resolve(): this {
    this.parameters.version ||= useApplication().getPackageDescription().version;
    this.parameters.url ||= "/version";
    return super.resolve();
  }

  /**
   * Serve the version of the app as plain text
   *
   * @param ctx - operation context to write the response to
   */
  @Route(".", ["GET"], {
    get: {
      summary: "Get the version of the application",
      responses: {
        200: {
          description: "Version of the application",
          content: {
            "text/plain": {
              schema: {
                type: "string"
              }
            }
          }
        }
      }
    }
  })
  version(ctx: OperationContext) {
    ctx.setHeader("Content-Type", "text/plain");
    ctx.write(this.parameters.version);
  }
}
