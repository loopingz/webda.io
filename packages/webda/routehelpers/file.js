"use strict";
const Executor = require("../services/executor.js");

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
	constructor(webda, name, params) {
		super(webda, name, params);
		this._type = "FileExecutor";
	}

	execute() {
		if (typeof(this._route.file) === "string") {
			var include = this._route.file;
			if (include.startsWith("./")) {
				include = process.cwd() + '/' + include;
			}
			return require(include)(this);
		} else {
			return this._route.file(this);
		}
	}
}

module.exports = FileRouteHelper;