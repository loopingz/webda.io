"use strict";
const CustomRouteHelper = require("./custom.js");

class FileRouteHelper extends CustomRouteHelper {
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