"use strict"
const Executor = require("./executor.js");

class InlineExecutor extends Executor {
	constructor(webda, name, params) {
		super(webda, name, params);
		this._type = "InlineExecutor";
	}

	execute() {
		var callback;
		// Eval the Inline method
		eval("callback = " + this.callable.callback);
		if (typeof(callback) == "function") {
			callback(this);
		} else {
			console.log("Cant execute the inline as it is not a function");
			throw 500;
		}
	}
}

module.exports = InlineExecutor