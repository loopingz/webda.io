import { Executor, Context } from "../index";

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
class StringRouteHelper extends Executor {
  /** @ignore */
  execute(ctx: Context): Promise<any> {
    if (this._params.mime) {
      ctx.writeHead(200, {
        "Content-Type": this._params.mime
      });
    }
    if (typeof this._params.result != "string") {
      ctx.write(JSON.stringify(this._params.result));
    } else {
      ctx.write(this._params.result);
    }
    ctx.end();
    return Promise.resolve();
  }
}

export { StringRouteHelper };
