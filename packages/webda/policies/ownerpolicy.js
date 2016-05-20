"use strict";

const Policy = require("./policy");

class OwnerPolicy extends Policy {
	/**
	 * Return false if can't create
	 */
	canCreate(ctx, object) {
		object.user = ctx.session.getUserId();
		if (!object.user) {
			throw 403;
		}
		return true;
	}
	/**
	 * Return false if can't update
	 */
	canUpdate(ctx, object) {
		if (object.user === undefined) {
			throw 400;
		}
		if (ctx.session.getUserId() !== object.user) {
			throw 403;
		}
		return true;
	}
	/**
	 * Return false if can't get
	 */
	canGet(ctx, object) {
		if (object.public) {
			return true;
		}
		if (ctx.session.getUserId() !== object.user) {
			throw 403;
		}
		if (!object.user) {
			throw 403;
		}
		return true;
	}
	/**
	 * Return false if can't delete
	 */
	canDelete(ctx, object) {
		if (object.user === undefined) {
			throw 400;
		}
		if (ctx.session.getUserId() !== object.user) {
			throw 403;
		}
		return true;
	}
}

module.exports = OwnerPolicy;