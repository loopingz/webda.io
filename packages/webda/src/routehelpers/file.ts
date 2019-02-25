import { Executor, Context } from "../index";

/**
 * Execute a custom JS file, it is almost like a custom Service except that this will not be a singleton
 * And it will be instantiate every call
 *
 * Configuration
 * '/url': {
 *    'type': 'file',
 *    'file': './customroute.js'
 * }
 *
 */
class FileRouteHelper extends Executor {
  /**
   * @ignore
   */
  execute(ctx: Context): Promise<any> {
    if (typeof ctx._route.file === "string") {
      var include = ctx._route.file;
      if (include.startsWith("./")) {
        include = process.cwd() + "/" + include;
      }
      let fct = require(include);
      if (fct.default) {
        fct = fct.default;
      }
      return fct(ctx);
    }
  }
}

export { FileRouteHelper };
