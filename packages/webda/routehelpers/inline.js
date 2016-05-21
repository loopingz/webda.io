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
		if (typeof(ctx._route.callback) == "string") {
			return this._webda.sandbox(ctx, "module.exports = " + ctx._route.callback);	
		} else {
			ctx._route.callback(ctx);
		}
		
	}
}

module.exports = InlineRouteHelper