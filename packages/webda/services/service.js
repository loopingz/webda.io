"use strict";

const EventEmitter = require('events');

class Service extends EventEmitter {
	constructor (webda, name, params) {
		super();
		this._webda = webda;
		this._name = name;
		this._params = params;
	}

	install(params) {

	}

	uninstall(params) {

	}

	__clean() {
		if (typeof(global.it) !== 'function') {
			throw Error("Only for test purpose")
		}
		return this.___cleanData();
	}

	___cleanData() {
		return Promise.resolve();
	}
}

module.exports = Service;