"use strict";
const WebdaServer = require("../handlers/http");
const Executor = require("../executors/executor");
const Webda = require("../core/webda");

class ConfigurationService extends Executor {

	init(config) {
		config['/services'] = {"method": ["GET"], "executor": this._name};
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
}

new WebdaConfigurationServer().serve(18181);