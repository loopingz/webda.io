"use strict";

/**
 *
 */
const Policy = Sup => class extends Sup {
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