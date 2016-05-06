"use strict"
const Executor = require("./executor.js");

class InlineExecutor extends Executor {
	constructor(webda, name, params) {
		super(webda, name, params);
		this._type = "InlineExecutor";
	}

	execute() {
		if (typeof(this._route.callback) == "string") {
			return this._webda.sandbox(this, "module.exports = " + this._route.callback);	
		} else {
			this._route.callback(this);
		}
		
	}
}

module.exports = InlineExecutor