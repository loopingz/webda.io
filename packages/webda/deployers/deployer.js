"use strict";
const _extend = require("util")._extend;

class Deployer {
	constructor (config, deployment) {
		this.params = {};
		this.resources = {};
		this.deployment = deployment;
		this.config = config;
		for (var i in this.config) {
			if (i[0] != "/") continue;
			this.config[i]._url = i;
		}
		if (deployment === undefined) {
			throw Error("Unknown deployment");
		}
		_extend(this.params, config.global.params);
		_extend(this.params, deployment.params);
		_extend(this.resources, this.params);
		_extend(this.resources, deployment.resources);
	}

	deploy(args) {
		return Promise.resolve();
	}
}

module.exports = Deployer;