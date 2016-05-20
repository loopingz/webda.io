"use strict";

const Service = require("../services/service.js");

/**
 *
 */
class Policy extends Service {
	/**
	 * Return false if can't create
	 */
	canCreate(ctx, object) {
		return true;
	}
	/**
	 * Return false if can't update
	 */
	canUpdate(ctx, object) {
		return true;
	}
	/**
	 * Return false if can't get
	 */
	canGet(ctx, object) {
		return true;
	}
	/**
	 * Return false if can't delete
	 */
	canDelete(ctx, object) {
		return true;
	}
}

module.exports = Policy;