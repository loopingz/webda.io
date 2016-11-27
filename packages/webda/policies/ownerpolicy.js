"use strict";

const OwnerPolicy = Sup => class extends Sup {
	/**
	 * Return false if can't create
	 */
	canCreate(ctx) {
		this.user = ctx.session.getUserId();
		if (!this.user) {
			throw 403;
		}
		return Promise.resolve(this);
	}
	/**
	 * Return false if can't update
	 */
	canUpdate(ctx) {
		// Allow to modify itself by default
		if (ctx.session.getUserId() !== this.user && ctx.session.getUserId() !== this.uuid) {
			throw 403;
		}
		return Promise.resolve(this);
	}
	/**
	 * Return false if can't get
	 */
	canGet(ctx) {
		if (this.public) {
			return Promise.resolve(this);
		}
		if (ctx.session.getUserId() !== this.user && ctx.session.getUserId() !== this.uuid) {
			throw 403;
		}
		if (!this.user && ctx.session.getUserId() !== this.uuid) {
			throw 403;
		}
		return Promise.resolve(this);
	}
	/**
	 * Return false if can't delete
	 */
	canDelete(ctx) {
		if (ctx.session.getUserId() !== this.user && ctx.session.getUserId() !== this.uuid) {
			throw 403;
		}
		return Promise.resolve(this);
	}
}

module.exports = OwnerPolicy;