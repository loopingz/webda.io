import { OperationContext, Service, ServiceParameters } from "@webda/core";

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
   * @inheritdoc
   */
  initRoutes() {
    super.initRoutes();
    this.addRoute(this.parameters.url, ["GET"], this.version, {
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
    });
  }

  /**
   * @inheritdoc
   */
  loadParameters(params: any) {
    params.version = params.version || this.getWebda().getApplication().getPackageDescription().version;
    params.url = params.url || "/version";
    return new VersionServiceParameters(params);
  }

  /**
   * Serve the version of the app
   *
   * @param ctx
   */
  version(ctx: OperationContext) {
    ctx.setHeader("Content-Type", "text/plain");
    ctx.write(this.parameters.version);
  }
}
