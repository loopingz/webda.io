"use strict"
const Executor = require("./executor.js");

class InlineExecutor extends Executor {
	constructor(webda, name, params) {
		super(webda, name, params);
		this._type = "InlineExecutor";
	}

	execute() {
		this._webda.sandbox(this, this.callable.callback);
	}
}

module.exports = InlineExecutor