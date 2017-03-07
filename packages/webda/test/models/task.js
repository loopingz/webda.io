"use strict";

const CoreModel = require('../../models/coremodel');

/**
 * @class
 */
class Task extends CoreModel {

	_getSchema() {
		return "./test/schemas/task.json";
	}

	_onSave() {
		this._autoListener = 1;
	}

	_onSaved() {
		this._autoListener = 2;
	}
}

module.exports = Task