"use strict";
const CustomExecutor = require("./custom.js");

class FileExecutor extends CustomExecutor {
	constructor(webda, name, params) {
		super(webda, name, params);
		this._type = "FileExecutor";
	}

	execute() {
		var include = "." + this.callable.file;
		return require(include)(this);
	}
}

module.exports = FileExecutor