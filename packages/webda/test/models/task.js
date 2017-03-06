"use strict";

const CoreModel = require('../../models/coremodel');

/**
 * @class
 */
class Task extends CoreModel {

	_getSchema() {
		return "./test/schemas/task.json";
	}
}

module.exports = Task