"use strict";

class Ident {
	constructor (type, uid, accessToken, refreshToken) {
		this.type = type;
		this.uid = uid;
		this.uuid = uid + "_" + type;
		this.tokens = {};
		this.tokens.refresh = refreshToken;
		this.tokens.access = accessToken;
	}

	getUser() {
		return this.user;
	}

	setUser(user) {
		this.user = user;
	}

	setMetadatas(meta) {
		this.metadatas = meta;
	}

	getMetadatas() {
		return this.metadatas;
	}
}

module.exports = Ident