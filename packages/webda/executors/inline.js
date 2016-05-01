"use strict"
const Executor = require("./executor.js");

class InlineExecutor extends Executor {
	constructor(webda, name, params) {
		super(webda, name, params);
		this._type = "InlineExecutor";
	}

	execute() {
		if (typeof(his.callable.callback) == "string") {
			return this._webda.sandbox(this, "module.exports = " + this.callable.callback);	
		} else {
			this.callable.callback(this);
		}
		
	}
}

module.exports = InlineExecutor