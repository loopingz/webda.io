"use strict"
const Executor = require("../services/executor.js");

class InlineRouteHelper extends Executor {

	execute() {
		if (typeof(this._route.callback) == "string") {
			return this._webda.sandbox(this, "module.exports = " + this._route.callback);	
		} else {
			this._route.callback(this);
		}
		
	}
}

module.exports = InlineRouteHelper