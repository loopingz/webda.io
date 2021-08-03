import { ServiceParameters, Service, Context, ModdaDefinition } from "..";

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
 */
export class VersionService<T extends VersionServiceParameters = VersionServiceParameters> extends Service<T> {
  /**
   * @inheritdoc
   */
  initRoutes() {
    super.initRoutes();
    this.addRoute(this.parameters.url, ["GET"], this.version);
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
  version(ctx: Context) {
    ctx.setHeader("Content-Type", "text/plain");
    ctx.write(this.parameters.version);
  }

  /**
   * @inheritdoc
   */
  static getModda(): ModdaDefinition {
    return {
      uuid: "Webda/Version",
      label: "Version",
      description: "Display your application version on a route"
    };
  }
}
