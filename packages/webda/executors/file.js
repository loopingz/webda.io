"use strict";
const CustomExecutor = require("./custom.js");

class FileExecutor extends CustomExecutor {
	constructor(webda, name, params) {
		super(webda, name, params);
		this._type = "FileExecutor";
	}

	execute() {
		var include = "." + this.callable.file;
		if (this.callable.type == "lambda") {
			// MAKE IT local compatible
			this.params["_http"] = this._http;
			var data = require(include)(this.params, {});
			this.handleResult(data, this._rawResponse);
		} else {
			require(include)(this);
		}
	}
}

module.exports = FileExecutor