"use strict";
var crypto = require('crypto');
var _extend = require('util')._extend;

function encrypt(algo, pass, text){
  var cipher = crypto.createCipher(algo,pass);
  var crypted = cipher.update(text,'utf8','hex');
  crypted += cipher.final('hex');
  return crypted;
}
 
function decrypt(algo, pass, text){
  var decipher = crypto.createDecipher(algo, pass);
  var dec = decipher.update(text,'hex','utf8');
  dec += decipher.final('utf8');
  return dec;
}

class SecureCookie {
	constructor(options, data) {

		this._algo = "aes-256-ctr";
		this._secret = options.secret;
		this._options = options;
		this._changed = false;
		if (data === undefined || data === '') {
			return;
		}
		if (typeof(data) === "string") {
			this._raw = data;
			try {
				_extend(this, this._decrypt(data));
			} catch (err) {
				// Reinit the session as we cannot read the cookie
				console.log("CANT DECRYPT:", data);
				this._changed = true;
			}
		} else {
			_extend(this, data);
		}
	}

	getProxy() {
		// Should use Proxy if available
		if (Object.observe) {
			Object.observe(this, (changes) => {
				if (changes[0].name == "_changed") return;
				this._changed = true;
			});
			return this;
		} else if (Proxy != undefined) {
			// Proxy implementation
			return new Proxy(this, {
				set: (obj, prop, value) => {
					obj[prop]=value;
					if (prop !== "_changed") {
						this._changed = true;
					}
					return true;
				}
			});
		}
	}
	login(userId, identUsed) {
		this.userId = userId;
		this.identUsed = identUsed;
	}

	isLogged() {
		return this.userId !== undefined;
	}

	destroy() {
		for (var prop in this) {
			if (prop[0] === "_") {
				continue;
			}
			delete this[prop];
		}
	}

	getIdentUsed() {
		return this.identUsed;
	}

	getUserId() {
		return this.userId;
	}

	logout() {
		delete this.userId;
	}

	_decrypt(data) {
		try {
			return JSON.parse(decrypt(this._algo, this._secret, data));
		} catch(err) {
			throw new Error("Bad SecureCookie");
		}
	}

	toJSON() {
		var data = {};
		for (var prop in this) {
			if (prop[0] === "_") {
				continue;
			}
			data[prop] = this[prop];
		}
		return data;
	}

	save() {		
		if (this.needSave()) {
			return encrypt(this._algo, this._secret, JSON.stringify(this));	
		}
		return this._raw;
	}

	needSave() {
		return this._changed;
	}
}

module.exports = SecureCookie;