"use strict";

const CoreModel = require('../../models/coremodel');

/**
 * @class
 */
class Task extends CoreModel {
	/**
	 * @ignore
	 */
	constructor (raw, secure) {
		super(raw, secure);
		this._schema = "./test/schemas/task.json";
	}
}

module.exports = Task