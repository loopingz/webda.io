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
		if (typeof(data) === "string") {
			this._raw = data;
			_extend(this, this._decrypt(data));
		} else {
			_extend(this, data);
		}
		// Should use Proxy if available
		Object.observe(this, (changes) => {
			if (changes[0].name == "_changed") {
				return;
			}
			this._changed = true;
		});
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
		return encrypt(this._algo, this._secret, JSON.stringify(this));
	}

	needSave() {
		return this._changed;
	}
}

module.exports = SecureCookie;