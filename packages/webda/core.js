"use strict";

var uriTemplates = require('uri-templates');
var _extend = require('util')._extend;
var vm = require('vm');
var fs = require('fs');
const path = require('path');

/**
var vm = require('vm');
var fs = require('fs');

var safe_require = function(mod) {
  var code    = fs.readFileSync(require.resolve(mod));
  var sandbox = {
    console : console,
    module  : {},
    require : function(mod) {
      // as a simple example, we'll block any requiring of the 'net' module, but
      // you could implement some sort of whitelisting/blacklisting for modules 
      // that are/aren't allowed to be loaded from your module:
      if (mod === 'net') {
        throw Error('not allowed');
      }
      // if the module is okay to load, load it:
      return require.apply(this, arguments);
    }
  };
  vm.runInNewContext(code, sandbox, __filename);
  return sandbox.module.exports;
};

var mod = safe_require('./mod1');
**/

class Webda {
	constructor (config) {
		this._vhost = '';
		// on the spot executors
		this._executors = {};
		this._executors['debug']=require('./executors/executor');
		this._executors['lambda']=require('./executors/lambda');
		this._executors['custom']=require('./executors/custom');
		this._executors['inline']=require('./executors/inline');
		this._executors['string']=require('./executors/string');
		this._executors['resource']=require('./executors/resource');
		this._executors['file']=require('./executors/file');
		// real service
		this._services = {};
		this._services['Authentication']=require('./services/passport');
		this._services['FileStore']=require('./stores/file');
		this._services['MongoStore']=require('./stores/mongodb');
		this._services['DynamoStore']=require('./stores/dynamodb');
		this._services['FileBinary']=require('./services/filebinary');
		this._services['S3Binary']=require('./services/s3binary');
		this._config = this.loadConfiguration(config);
	}

	require(executor, path) {
		var code = fs.readFileSync(require.resolve(path));
		this.sandbox(code);
	}

	sandbox(executor, code) {
		var sandbox = {
			// Should be custom console
			console : console,
			webda: executor,
			executor: executor,
			module  : {},
			require : function(mod) {
				// as a simple example, we'll block any requiring of the 'net' module, but
		      	// you could implement some sort of whitelisting/blacklisting for modules 
		      	// that are/aren't allowed to be loaded from your module:
		      	if (mod === 'net') {
		        	throw Error('not allowed');
		      	}
		      	// if the module is okay to load, load it:
		      	return require.apply(this, arguments);
		    }
		};
		vm.runInNewContext(code, sandbox);
		return sandbox.module.exports(executor);
	}

	loadConfiguration(config) {
		if (typeof(config) === 'object') {
			return config;
		}
		var fs = require('fs');
		if (config !== undefined) {
			if (fs.existsSync(config)) {
				console.log("Load config.js");
				return require(config);
			}
		}
		var result = null;
		// Default load from file
		if (process.env.WEBDA_CONFIG == undefined) {
			config = './webda.config.js';
			if (fs.existsSync(config)) {
				console.log("Load config.js");
				return require(path.resolve(config));
			}
			config = './webda-config.json';
			if (fs.existsSync(config)) {
				console.log("Load webda-config.json");
				return require(path.resolve(config));
			}
			config = '/etc/webda/config.json';
			if (result == undefined && fs.existsSync(config)) {
				console.log("Load " + config);
				return require(config);
			}
		} else {
			console.log("Load " + process.env.WEBDA_CONFIG);
			return require(process.env.WEBDA_CONFIG);
		}
	}

	setHost(vhost) {
		this._vhost = vhost
		this.initHosts(vhost, this._config[vhost]);
	}

	getSession(data) {
		const SecureCookie = require("./utils/cookie.js");
		return new SecureCookie({secret: 'WebdaSecret'}, data);
	}

	getService(name) {
		if (name === undefined) {
			name = "_default";
		}
		name = name.toLowerCase();
		if (this._config[this._vhost] !== undefined) {
			if (this._config[this._vhost].global !== undefined && this._config[this._vhost].global._services !== undefined
					&& this._config[this._vhost].global._services[name]) {
				return this._config[this._vhost].global._services[name];
			}
		}
	}

	getRouteFromUrl(config, method, url) {
		if (url.indexOf("?") >= 0) {
			url = url.substring(0, url.indexOf("?"));
	    }
		for (let routeUrl in config) {
			if (routeUrl === "global") {
	        	continue;
			}
			var map = config[routeUrl];

			// Check method
			if  (Array.isArray(map['method'])) {
				if (map['method'].indexOf(method) === -1) {
					continue;
				}
			} else if (map['method'] !== method) {
	        	continue;
	      	}

			if (routeUrl === url) {
	        	return map;
	      	}

	      	if (map['_uri-template-parse'] === undefined) {
	        	continue;
	      	}

	      	var parse_result = map['_uri-template-parse'].fromUri(url);
	      	if (parse_result !== undefined) {
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
	        	if (map.params == undefined) {
	        		map.params = {};
	        	}
	        	_extend(map.params, parse_result);
	        	return map;
	      	}
	    }
	}

	getExecutor(vhost, method, url, protocol, port, headers) {
		// Check vhost
		var wildcard = false;
	    if (this._config[vhost] === undefined) {
	       if (this._config['*'] === undefined) {
	    	   return null;
	       }
	       wildcard = true;
	       vhost = this._config['*'];
	    }
	    this.setHost(vhost);
	    // Init vhost if needed
	    this.initHosts(vhost, this._config[vhost]);
	    // Check mapping
	    var route = this.getRouteFromUrl(this._config[vhost], method, url);
	    if (route === undefined) {
	    	return;
	    }
	    route._http = {"host":vhost, "method":method, "url":url, "protocol": protocol, "port": port, "headers": headers, "wildcard": wildcard};
	    return this.getServiceWithRoute(route);
	}

	getServiceWithRoute(route) {
		var name = route.executor;
		var executor = this.getService(name);
		if (executor === undefined && this._executors[name] !== undefined) {
			executor = new this._executors[name](this, name, this._config[route._http.host].global.params);
		}
		if (executor !== undefined) {
	    	executor.setRoute(this.extendParams(route, this._config[route._http.host].global));
	    }
	    return executor;
	}

	initURITemplates(config) {
		// Prepare tbe URI parser
	  	for (var map in config) {
		  	if (map.indexOf("{") != -1) {
		  		config[map]['_uri-template-parse'] = uriTemplates(map);
	  		}
	  	}
	}

	flushHeaders(executor) {
		console.log("Abstract implementation of Webda");
	}

	flush(executor) {
		console.log("Abstract implementation of Webda");
	}

	extendParams(local, wider) {
		var params = _extend({}, wider);
		return _extend(params, local);
	}

	initServices(config) {
		var services = config.global.services;
		if (config.global._services === undefined) {
			config.global._services = {};
		}
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
		      		if (typeof(include) === "string") {
		        		serviceConstructor = require(include)
		        	} else {
		        		serviceConstructor = include;
		        	}
		      	} catch (ex) {
		        	console.log(ex);
		        	continue;
		      	}
		    }
		    if (serviceConstructor === undefined) {
		    	continue;
		    }
	      	var params = this.extendParams(services[service], config.global.params);
	      	delete params.require;
	      	try {
	      		config.global._services[service.toLowerCase()] = new serviceConstructor(this, service, params);
	      	} catch (err) {
	      		
	      	}
	    }

	    // Init services
	    for (var service in config.global._services) {
	      	if (config.global._services[service].init !== undefined) {
	        	config.global._services[service].init(config);
	      	}
	    }
	}

	jsonFilter(key, value) {
		if (key[0] === '_') return undefined;
	    return value;
	}

	initAll() {
		for (var vhost in this._config) {
			if (vhost === "*") continue;
			this.initHosts(vhost, this._config[vhost]);
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