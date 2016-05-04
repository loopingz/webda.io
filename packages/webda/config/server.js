"use strict";
const WebdaServer = require("../handlers/http");
const Executor = require("../executors/executor");
const Webda = require("../core/webda");
const _extend = require("util")._extend;

class ConfigurationService extends Executor {

	init(config) {
		config['/services'] = {"method": ["GET"], "executor": this._name};
		config['/deployments'] = {"method": ["GET"], "executor": this._name};
		config['/deployments'] = {"method": ["GET"], "executor": this._name};
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
				this.write(this._webda.config[this.params.vhost]);
				return;
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

	deployAws(env) {
		var vhost = this.config["*"];
		if (vhost === undefined) {
			for (var i in this.config) {
				vhost = i;
				break;
			}
		}
		return this.getService("deployments").get(env).then ( (deployment) => {
			const AWSDeployer = require("../deployers/aws");
			return new AWSDeployer(this.config[vhost], deployment).deploy();
		});
	}
}

var args = process.argv;
var cmd = '';
if (args === undefined || args.length < 3) {
	args = [''];
} else {
	args = args.slice(2);
}
console.log(args);
switch (args[0]) {
	case 'insult':
		console.log(myArgs[1], 'smells quite badly.');
		break;
	case 'aws-deploy':
		if (args[1] === undefined) {
			console.log('Need to specify an environment');
			return;
		}
		new WebdaConfigurationServer().deployAws(args[1]).catch( (err) => {
			console.trace(err);
		});
		break;
	default:
		new WebdaConfigurationServer().serve(18181);
		// Need to launch the browser
}