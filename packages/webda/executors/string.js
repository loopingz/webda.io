"use strict";
const Executor = require('./executor.js');

class StringExecutor extends Executor {
	constructor(webda, name, params) {
		super(webda, name, params);
		this._type = "StringExecutor";
	}

	execute() {
		if (this.callable.mime) {
		   this.writeHead(200, {'Content-Type': this.callable.mime});
		}
		if (typeof this.callable.result != "string") {
			this.write(JSON.stringify(this.callable.result));
		} else {
			this.write(this.callable.result);
		}
		this.end();
	}
}

module.exports = StringExecutor