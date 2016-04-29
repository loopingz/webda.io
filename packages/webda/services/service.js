"use strict";

const EventEmitter = require('events');

class Service extends EventEmitter {
	constructor (webda, name, params) {
		super();
		this._webda = webda;
		this._name = name;
		this._params = params;
	}
}

module.exports = Service;