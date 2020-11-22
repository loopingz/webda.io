import { Context, Service } from "../index";
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
 * Return a static string with a static mime type
 * Not really useful i concede
 *
 * Configuration
 * '/url': {
 *    'type': 'string',
 *    'params': {
 *         'mime': 'text/plain',
 *         'result': 'echo'
 *     }
 * }
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
}

export { EchoService };
