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
	execute() {
		if (this._params.mime) {
		   this.writeHead(200, {'Content-Type': this._params.mime});
		}
		if (typeof this._params.result != "string") {
			this.write(JSON.stringify(this._params.result));
		} else {
			this.write(this._params.result);
		}
		this.end();
	}
}

module.exports = StringRouteHelper