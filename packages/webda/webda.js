"use strict";

var uriTemplates = require('uri-templates');
var extend = require('util')._extend;

class Webda {
	constructor (config) {
		this._vhost = '';
		this._executors = {};
		this._executors['debug']=require('./executors/executor');
		this._executors['lambda']=require('./executors/lambda');
		this._executors['custom']=require('./executors/custom');
		this._executors['inline']=require('./executors/inline');
		this._executors['string']=require('./executors/string');
		this._executors['resource']=require('./executors/resource');
		this._executors['file']=require('./executors/file');
		this._services = {};
		this._services['Authentication']=require('./services/passport');
		this._services['FileStore']=require('./stores/file');
		this._services['FileBinary']=require('./services/filebinary');
		this.config = this.loadConfiguration(config);
	}

	loadConfiguration(config) {
		if (typeof(config) === 'object') {
			return config;
		}
		var fs = require('fs');
		var config = null;
		var result = null;
		// Default load from file
		if (process.env.WEBDA_CONFIG == undefined) {
			config = './webda-config.json';
			if (fs.existsSync(config)) {
				result = require(config);
			}
			config = '/etc/webda/config.json';
			if (result == undefined && fs.existsSync(config)) {
				result = require(config);
			}
		} else {
			result = require(process.env.WEBDA_CONFIG);
		}
		return result;
		// Load from URL
		console.log("Configuration can't be found");
	}

	setHost(host) {
		this._vhost = host
	}

	getService(name, mapper) {
		if (name === undefined) {
			name = "_default";
		}
		if (this.config[this._vhost] !== undefined) {
			if (this.config[this._vhost].global !== undefined && this.config[this._vhost].global.services !== undefined
					&& this.config[this._vhost].global.services[name]) {
				return this.config[this._vhost].global.services[name]._service;
			}
		}
		if (this._executors[name] !== undefined) {
			return new this._executors[name](this, name, mapper);
		}
	}

	getStore(name) {
		// Deprecated
		return this.getService(name)
	}

	getExecutor(vhost, method, url, protocol, port, headers) {
		// Check vhost
	    if (this.config[vhost] === undefined) {
	       if (this.config['*'] === undefined) {
	    	   return null;
	       }
	       vhost = this.config['*'];
	    }
	    this.setHost(vhost);
	    // Init vhost if needed
	    this.initHosts(vhost, this.config[vhost]);
	    // Check mapping
	    var callable = null;
	    var params = [];
	    if (url.indexOf("?") >= 0) {
	      url = url.substring(0, url.indexOf("?"));
	    }
	    for (var map in this.config[vhost]) {
	      if (map == "global") {
	        continue;
	      }
	      if  (Array.isArray(this.config[vhost][map]['method'])) {
	        if (this.config[vhost][map]['method'].indexOf(method) == -1) {
	          continue;
	        }
	      } else if (this.config[vhost][map]['method'] != method) {
	        continue;
	      }
	      if (map == url) {
	        callable = this.getCallable(this.config[vhost][map]["executor"], this.config[vhost][map]);
	        break;
	      }
	      if (this.config[vhost][map]['uri-template-parse'] === undefined) {
	        continue;
	      }
	      var parse_result = this.config[vhost][map]['uri-template-parse'].fromUri(url);
	      if (parse_result != undefined) {
	        var skip = false;
	        for (var val in parse_result) {
	          if (parse_result[val].indexOf("/") >= 0) {
	            skip = true;
	            break;
	          }
	        }
	        if (skip) {
	          continue;
	        }
	        callable = this.getCallable(this.config[vhost][map]["executor"], this.config[vhost][map], parse_result);
	        break;
	      }
	    }
	    if (callable != null) {
	    	var vhost_config = this.config[vhost]["global"];
	    	if (vhost_config['params'] != undefined) {
	          callable.enrichParameters(vhost_config['params']);
	    	}
	      if (callable["_http"] == undefined) {
	          callable["_http"] = {"host":vhost, "method":method, "url":url, "protocol": protocol, "port": port, "headers": headers};
	      }
	    }
	    return callable;
	}

	getCallable(name, mapper, urlparams) {
		var callable = this.getService(name, mapper);
	    if (callable != null) {
	    	callable.setParameters(mapper.params);
	    	if (urlparams) {
	        	callable.enrichParameters(urlparams);
	        }
	    }
	    return callable;
	}

	initURITemplates(config) {
		// Prepare tbe URI parser
	  	for (var map in config) {
		  	if (map.indexOf("{") != -1) {
		  		config[map]['uri-template-parse'] = uriTemplates(map);
	  		}
	  	}
	}

	initServices(config) {
		var services = config.global.services;
		if (services === undefined) {
			return;
		}

	    // Construct services
	    for (var service in services) {
	    	var type = services[service].type;
	    	if (type === undefined) {
	    		type = service;
	    	}
	      	var include = services[service].require;
	      	var serviceConstructor = undefined;
	      	if (include === undefined) {
	        	serviceConstructor = this._services[type];
	      	} else {
		      	try {
		        	serviceConstructor = require(include)
		      	} catch (ex) {
		        	console.log(ex);
		        	continue;
		      	}
		    }
		    if (serviceConstructor === undefined) {
		    	continue;
		    }
	      	var params = services[service];
	      	delete params.require;
	      	console.log("Init service " + service);
	      	services[service]._service = new serviceConstructor(this, service, params);
	    }

	    // Init services
	    for (var service in services) {
	      if (services[service]._service === undefined) {
	        continue;
	      }
	      if (services[service]._service.init !== undefined) {
	        services[service]._service.init(config);
	      }
	    }
	}

	initAll() {
		for (var vhost in this.config) {
			if (vhost === "*") continue;
			this.initHosts(vhost, this.config[vhost]);
		}
	}
	initHosts(vhost, config) {
	    if (config._initiated) {
	      return;
	    }

	    if (config.global !== undefined) {
		    this.initServices(config);
		}
		this.initServices(config);
		this.initURITemplates(config);
	    
	    config._initiated = true;
  }

}
Webda.Service = require("./services/service");

module.exports = Webda;