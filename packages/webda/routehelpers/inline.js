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
	execute() {
		if (typeof(this._route.callback) == "string") {
			return this._webda.sandbox(this, "module.exports = " + this._route.callback);	
		} else {
			this._route.callback(this);
		}
		
	}
}

module.exports = InlineRouteHelper