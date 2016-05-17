"use strict";

const Service = require("../services/service.js");

/**
 *
 */
class Policy extends Service {
	/**
	 * Return false if can't create
	 */
	canCreate(object) {
		return true;
	}
	/**
	 * Return false if can't update
	 */
	canUpdate(object) {
		return true;
	}
	/**
	 * Return false if can't get
	 */
	canGet(object) {
		return true;
	}
	/**
	 * Return false if can't delete
	 */
	canDelete(object) {
		return true;
	}
}

module.exports = Policy;