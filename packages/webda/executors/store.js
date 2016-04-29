"use strict";
const Executor = require('./executor.js');

class StoreExecutor extends Executor {
	constructor(webda, name, params) {
		super(webda, name, params);
		this._type = "StoreExecutor";
	};

}

module.exports = StoreExecutor