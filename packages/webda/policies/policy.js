"use strict";

/**
 *
 */
const Policy = Sup => class extends Sup {
	/**
	 * Return false if can't create
	 */
	canCreate(ctx, object) {
		return Promise.resolve(this);
	}
	/**
	 * Return false if can't update
	 */
	canUpdate(ctx, object) {
		return Promise.resolve(this);
	}
	/**
	 * Return false if can't get
	 */
	canGet(ctx, object) {
		return Promise.resolve(this);
	}
	/**
	 * Return false if can't delete
	 */
	canDelete(ctx, object) {
		return Promise.resolve(this);
	}
}

module.exports = Policy;