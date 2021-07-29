import { Context, ModdaDefinition, Service } from "../index";
import { ServiceParameters } from "./service";

class EchoServiceParameter extends ServiceParameters {
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
 * 
 * ```javascript
 * "Version": {
 *  "type": "Webda/EchoService",
 *  "result": "${package.version}",
 *  "url": "/version",
 *  "mime": "text/plain"
 * }
 * ```
 *
 */
class EchoService extends Service<EchoServiceParameter> {
  /**
   * Load parameters
   *
   * @param params
   * @ignore
   */
  loadParameters(params: any): ServiceParameters {
    return new EchoServiceParameter(params);
  }

  /** @ignore */
  initRoutes() {
    this.addRoute(this.parameters.url, ["GET"], this.execute);
  }

  /** @ignore */
  execute(ctx: Context): Promise<any> {
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
    ctx.end();
    return Promise.resolve();
  }

  /**
   * @inheritdoc
   */
   static getModda(): ModdaDefinition {
    return {
      uuid: "Webda/EchoService",
      label: "Echo Service",
      description: "Output a staticly defined result, useful to display verison"
    };
  }
}

export { EchoService };
