"use strict";
const WebdaServer = require("../handlers/http");
const Executor = require("../executors/executor");
const Webda = require("../core");
const _extend = require("util")._extend;

class ConfigurationService extends Executor {

	init(config) {
		config['/services'] = {"method": ["GET"], "executor": this._name};
		config['/services/{vhost}'] = {"method": ["POST"], "executor": this._name};
		config['/executors/{vhost}'] = {"method": ["POST"], "executor": this._name};
		config['/deployments'] = {"method": ["GET", "POST"], "executor": this._name};
		config['/deployments/{name}'] = {"method": ["GET", "DELETE", "PUT"], "executor": this._name};
		config['/configs'] = {"method": ["POST", "GET"], "executor": this._name};
		config['/configs/{vhost}'] = {"method": ["PUT", "GET", "DELETE"], "executor": this._name};
	}

	execute(executor) {
		if (this._http.method == "GET") {
			if (this._http.url === "/configs") {
				this.write(Object.keys(this._webda.config));
				return;
			} else if (this._http.url === "/services") {
				this.write(this._webda.services);
			} else if (this._http.url === "/deployments") {
				return this.getStore("deployments").find().then ( (result) => {
					this.write(result);
				});
			} else if (this.params.vhost !== undefined) {
				this.write(this._webda.config[this._webda._vhost]);
				return;
			}
		} else if (this._http.method == "POST") {
			if (this._http.url === "/services") {
				console.log(this.body);
				let name = this.body.uuid;
				delete this.body.uuid;
				this._webda.config[this.webda.vhost].global.services[name]=this.body;
				this._webda.saveConfiguration();
			} else if (this._http.url === "/executors") {
				if (this.body.url) {
					var body = this.body.url;
					delete this.body.url;
					this._webda.config[this.webda.vhost][body] = this.body;
					this._webda.saveConfiguration();
					throw 204;
				}
				throw 404;
			} else if (this._http.url === "/deployments") {
				return this._webda.getStore("deployments").create(this.body);
			}
		} else if (this._http.method == "PUT") {
			if (this._http.url.startsWith("/services") && this.params.vhost !== undefined) {
				this._webda.config[this.params.vhost].global.services
				console.log(this.body);
				this._webda.saveConfiguration();
			} else if (this._http.url === "/executors") {
				if (this.body.url) {
					var body = this.body.url;
					delete this.body.url;
					this._webda.config[this.params.vhost][body] = this.body;
				}
				throw 204;
			} else if (this._http.url.startsWith("/deployments") && this.params.vhost !== undefined) {
				return this._webda.getStore("deployments").update(this.body);
			} else if (this._http.url.startsWith("/configs") && this.params.vhost !== undefined) {
				this._webda.config[this.params.vhost].global.params = this.body;
				throw 204;
			}
		}
	}
}

var ServerConfig = {
	"*": "localhost",
	localhost: {
		global: {
			services: {
				deployments: {
					expose: {},
					folder: './deployments',
					type: 'FileStore'
				},
				configuration: {
					require: ConfigurationService
				}
			}
		}
	}
};

class WebdaConfigurationServer extends WebdaServer {

	constructor (config) {
		super(config);
		this.initAll();
		this._vhost = 'localhost';
	}

	saveConfiguration() {

	}

	loadConfiguration(config) {
		this._mockWedba = new Webda();
		for (var i in this._mockWedba._config) {
			if (i === "*") continue;
			for (var j in this._mockWedba._config[i]) {
				if (j === "global") continue;
				this._mockWedba._config[i][j]["-manual"] = true;
			}
		}
		this._mockWedba.initAll();
		this.config = this._mockWedba._config;
		return ServerConfig;
	}

	deployAws(env, args) {
		var vhost = this.config["*"];
		if (vhost === undefined) {
			for (var i in this.config) {
				vhost = i;
				break;
			}
		}
		return this.getService("deployments").get(env).then ( (deployment) => {
			const AWSDeployer = require("../deployers/aws");
			return new AWSDeployer(vhost, this.config[vhost], deployment).deploy(args);
		});
	}

	undeployAws(env, args) {
		var vhost = this.config["*"];
		if (vhost === undefined) {
			for (var i in this.config) {
				vhost = i;
				break;
			}
		}
		return this.getService("deployments").get(env).then ( (deployment) => {
			const AWSDeployer = require("../deployers/aws");
			return new AWSDeployer(vhost, this.config[vhost], deployment).undeploy(args);
		});
	}

	commandLine(args) {
		switch (args[0]) {
			case 'aws-deploy':
				if (args[1] === undefined) {
					console.log('Need to specify an environment');
					return;
				}
				this.deployAws(args[1], args.slice(2)).catch( (err) => {
					console.trace(err);
				});
				break;
			case 'aws-undeploy':
				if (args[1] === undefined) {
					console.log('Need to specify an environment');
					return;
				}
				new this.undeployAws(args[1], args.slice(2)).catch( (err) => {
					console.trace(err);
				});
				break;
			}
	}
}

module.exports = WebdaConfigurationServer