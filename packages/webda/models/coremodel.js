"use strict";
const uuid = require('uuid');
const OwnerPolicy = require('../policies/ownerpolicy');

/**
 * First basic model for Ident
 * Will evolve with version 0.2 and Model addition
 *
 * @class
 */
class CoreModel extends OwnerPolicy(Object) {
	/**
	 * @ignore
	 */
	constructor (raw, secure) {
		super();
		this.load(raw, secure);
	}

	load(raw, secure) {
		if (!raw.uuid) {
			raw.uuid = this.generateUid();
		}
		for (let prop in raw) {
			if (!secure && (prop[0] === "_" || prop.indexOf('$_') === 0)) {
				continue;
			}
			this[prop] = raw[prop];
		}
	}

	validate(ctx, updates) {
		if (!this._schema) {
			return true;
		}
		if (updates) {
			this.load(updates);
		}
		return ctx._webda.validate(this, this._schema);
	}

	generateUid() {
		return uuid.v4();
	}

	_jsonFilter(key, value) {
		if (key[0] === '_') {
			return undefined;
		}
		return value;
	}

	toJSON(ctx) {
		let obj = {};
		for (let i in this) {
			let value = this._jsonFilter(i, this[i]);
			if (value === undefined) continue;
			obj[i] = value;
		}
		return obj;
	}
}

module.exports = CoreModel;