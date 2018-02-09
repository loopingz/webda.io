"use strict";
const Executor = require('../services/executor.js');

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
  execute(ctx) {
    if (ctx._params.mime) {
      ctx.writeHead(200, {
        'Content-Type': ctx._params.mime
      });
    }
    if (typeof ctx._params.result != "string") {
      ctx.write(JSON.stringify(ctx._params.result));
    } else {
      ctx.write(ctx._params.result);
    }
    ctx.end();
  }
}

module.exports = StringRouteHelper
