"use strict"
const Executor = require("../services/executor.js");

/**
 * Execute a custom JS code, would recommand to use file instead to avoid polluing the configuration file
 *
 * Configuration
 * '/url': {
 *    'type': 'inline',
 *    'callback': 'function (executor) { executor.write("Test"); }'	
 * }
 *
 */
class InlineRouteHelper extends Executor {
  /** @ignore */
  execute(ctx) {
    return Promise.resolve(this._webda.sandbox(ctx, "module.exports = " + ctx._route.callback));
  }
}

module.exports = InlineRouteHelper
