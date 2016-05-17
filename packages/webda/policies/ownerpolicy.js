"use strict";

const Policy = require("./policy");

class OwnerPolicy extends Policy {
	/**
	 * Return false if can't create
	 */
	canCreate(object) {
		console.log("policy executor", this._webda);
		object.user = this._webda.getSession().getUserId();
		if (!object.user) {
			throw 403;
		}
		return true;
	}
	/**
	 * Return false if can't update
	 */
	canUpdate(object) {
		if (object.user === undefined) {
			throw 400;
		}
		if (this._webda.getSession().getUserId() !== object.user) {
			throw 403;
		}
		return true;
	}
	/**
	 * Return false if can't get
	 */
	canGet(object) {
		if (object.public) {
			return true;
		}
		if (this._webda.getSession().getUserId() !== object.user) {
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
	canDelete(object) {
		if (object.user === undefined) {
			throw 400;
		}
		if (this._webda.getSession().getUserId() !== object.user) {
			throw 403;
		}
		return true;
	}
}

module.exports = OwnerPolicy;