"use strict";
const CustomExecutor = require("./custom.js");

class FileExecutor extends CustomExecutor {
	constructor(webda, name, params) {
		super(webda, name, params);
		this._type = "FileExecutor";
	}

	execute() {
		if (typeof(this.callable.file) === "string") {
			var include = this.callable.file;
			if (include.startsWith("./")) {
				include = process.cwd() + '/' + include;
			}
			return require(include)(this);
		} else {
			return this.callable.file(this);
		}
	}
}

module.exports = FileExecutor;