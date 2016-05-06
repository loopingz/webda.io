"use strict";
const WebdaServer = require("../handlers/http");
const Executor = require("../executors/executor");
const Webda = require("../core");
const _extend = require("util")._extend;

class ConfigurationService extends Executor {

	init(config) {
		config['/services'] = {"method": ["GET"], "executor": this._name, "_method": this.getServices};
		config['/services/{vhost}'] = {"method": ["POST", "PUT", "DELETE"], "executor": this._name, "_method": this.crudService};
		config['/routes/{vhost}'] = {"method": ["POST", "PUT", "DELETE"], "executor": this._name, "_method": this.crudRoute};
		config['/deployments'] = {"method": ["GET", "POST"], "executor": this._name, "_method": this.restDeployment};
		config['/deployments/{name}'] = {"method": ["GET", "DELETE", "PUT"], "executor": this._name, "_method": this.restDeployment};
		config['/configs'] = {"method": ["POST", "GET"], "executor": this._name, "_method": this.getConfigs};
		config['/configs/{vhost}'] = {"method": ["GET"], "executor": this._name, "_method": this.getConfig};
		config['/configs/{vhost}/params'] = {"method": ["PUT"], "executor": this._name, "_method": this.updateConfig};
	}

	getServices() {
		this.write(this._webda.services);
	}

	crudService() {
		if (this._route._http.method === "DELETE") {
			delete this._webda.config[this.webda.vhost].global.services[name];
			this._webda.saveConfiguration();
			return;	
		}
		let name = this.body.uuid;
		delete this.body.uuid;
		if (this._route._http.method === "POST" && this._webda.config[this.webda.vhost].global.services[name] != null) {
			throw 400;
		}
		this._webda.config[this.webda.vhost].global.services[name]=this.body;
		this._webda.saveConfiguration();
	}

	crudRoute() {
		// TODO Check query string
		if (this.body.url) {
			throw 400;
		}
		var body = this.body.url;
		if (this._route._http.method === "DELETE") {
			delete this._webda.config[this.webda.vhost][body]
		}
		delete this.body.url;
		if (this._route._http.method === "POST" && this._webda.config[this.webda.vhost][body] != null) {
			throw 400;
		}
		this._webda.config[this.webda.vhost][body] = this.body;
		this._webda.saveConfiguration();
	}

	getConfigs() {
		this.write(Object.keys(this._webda.config));
	}

	getConfig() {
		this.write(this._webda.config[this._webda._vhost]);
	}

	updateConfig() {
		this._webda.config[this.params.vhost].global.params = this.body;
	}

	restDeployment() {
		if (this._route._http.method == "GET") {
			if (this._params.name) {

			} else {
				return this.getService("deployments").find().then ( (result) => {
					this.write(result);
				});
			}
		} else if (this._route._http.method == "POST") {
			return this._webda.getService("deployments").create(this.body);
		} else if (this._http.method == "PUT") {
			if (this._http.url.startsWith("/deployments") && this.params.vhost !== undefined) {
				return this._webda.getService("deployments").update(this.body);
			}
		} else if (this._http.method == "DELETE") {
			return this._webda.getService("deployments").delete(this.body);
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