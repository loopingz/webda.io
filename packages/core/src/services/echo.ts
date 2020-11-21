import { Context, Service } from "../index";
import { ServiceParameters } from "./service";

class EchoServiceParameter extends ServiceParameters {
  mime: string;
  result: string | any;
}
/**
 * Return a static string with a static mime type
 * Not really usefully i concede
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
