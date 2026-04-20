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
   * @default /version
   */
  url?: string;
}

/**
 * Display the version of the app on a route
 * @WebdaModda VersionService
 */
export class VersionService<T extends VersionServiceParameters = VersionServiceParameters> extends Service<T> {
  /**
   * Set defaults for version and url from the application's package.json
   * @param params - raw configuration values
   * @returns initialized VersionServiceParameters
   */
  loadParameters(params: any) {
    params.version = params.version || useApplication().getPackageDescription().version;
    params.url = params.url || "/version";
    return new VersionServiceParameters().load(params);
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
