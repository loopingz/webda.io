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
			if (!secure && (prop[0] === "_")) {
				continue;
			}
			this[prop] = raw[prop];
		}
	}

	/**
	 * Return the object schema, if defined any modification done to the object by external source
	 * must comply to this schema
	 */
	_getSchema() {
		return;
	}

	validate(ctx, updates) {
		return new Promise((resolve, reject) => {
			let schema = this._getSchema();
			if (!schema) {
				resolve(true);
			}
			if (updates) {
				this.load(updates);
			}
			if (!ctx._webda.validate(this, schema)) {
				reject(ctx._webda.validationLastErrors());
			}
			resolve(true);
		});
	}

	generateUid() {
		return uuid.v4();
	}

	_jsonFilter(key, value) {
		if (key[0] === '_' && key.length > 1 && key[1] === '_') {
			return undefined;
		}
		return value;
	}

	toStoredJSON() {
		return JSON.stringify(this._toJSON(true));
	}

	_toJSON(secure) {
		let obj = {};
		for (let i in this) {
			let value = this[i];
			if (!secure) {
				value = this._jsonFilter(i, this[i]);
			}
			if (value === undefined) continue;
			obj[i] = value;
		}
		return obj;
	}

	toJSON() {
		return this._toJSON(false);
	}
}

module.exports = CoreModel;