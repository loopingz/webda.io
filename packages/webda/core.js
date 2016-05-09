"use strict";

var uriTemplates = require('uri-templates');
var _extend = require('util')._extend;
var vm = require('vm');
var fs = require('fs');
const path = require('path');
const cookieSerialize = require("cookie").serialize;

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
		this._services['Mailer']=require('./services/mailer');
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
				this._configFile = path.resolve(config);
				return require(this._configFile);
			}
			config = '/etc/webda/config.js';
			if (result == undefined && fs.existsSync(config)) {
				this._configFile = path.resolve(config);
				return require(this._configFile);
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

	getSession() {
		return this._currentExecutor.session;
	}

	getNewSession(data) {
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
		for (let i in config._pathMap) {
			var routeUrl = config._pathMap[i].url;
			var map = config._pathMap[i].config;;

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
	      		
	        	if (map.params == undefined) {
	        		map.params = {};
	        	}
	        	_extend(map.params, parse_result);
	        	map._uriParams = parse_result;
	        	return map;
	      	}
	    }
	}

	getExecutor(vhost, method, url, protocol, port, headers) {
		// Check vhost
		var wildcard = false;
		var originalVhost = vhost;
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
	    route._http = {"host":vhost, "vhost": originalVhost, "method":method, "url":url, "protocol": protocol, "port": port, "headers": headers, "wildcard": wildcard, "root": protocol + "://" + vhost};
	    return this.getServiceWithRoute(route);
	}

	getSecret() {
		// For now a static config file but should have a rolling service secret
		return this._config[this._vhost].global.secret;
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

	execute(executor) {
		this._currentExecutor = executor;
		return executor.execute();
	}

	handle404() {

	}

	extendParams(local, wider) {
		var params = _extend({}, wider);
		return _extend(params, local);
	}

	getCookieHeader(executor) {
		var session = executor.session;
		var params = {'path':'/', 'domain':executor._route._http.host, 'httpOnly': true, secure: false, maxAge: 86400*7};
		if (executor._route._http.protocol == "https") {
			params.secure = true;
		}
		if (executor._route._http.wildcard) {
			params.domain = executor._route._http.vhost;
		}
		if (executor._params.cookie !== undefined) {
			if (executor._params.cookie.domain) {
				params.domain = executor._params.cookie.domain;
			} else {
				params.domain = executor._route._http.host;
			}
			if (executor._params.cookie.maxAge) {
				params.maxAge = executor._params.cookie.maxAge;
			}
		}
		// Expiracy at one week - should configure it
		var res = cookieSerialize('webda', session.save(),  params);
		return res;
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
		      			if (include.startsWith("./")) {
							include = process.cwd() + '/' + include;
						}
		        		serviceConstructor = require(include);
		        	} else {
		        		serviceConstructor = include;
		        	}
		      	} catch (ex) {
		      		console.log(ex);
		        	continue;
		      	}
		    }
		    if (serviceConstructor === undefined) {
		    	console.log("No constructor found for service " + service);
		    	continue;
		    }
	      	var params = this.extendParams(services[service], config.global.params);
	      	delete params.require;
	      	try {
	      		config.global._services[service.toLowerCase()] = new serviceConstructor(this, service, params);
	      	} catch (err) {
	      		console.log(err);
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
		var oldHost = this._vhost;
		for (var vhost in this._config) {
			if (vhost === "*") continue;
			this.setHost(vhost);
			this.initHosts(vhost, this._config[vhost]);
		}
		this._vhost = oldHost;
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

	    // Order path desc
	    config._pathMap = [];
	    for (var i in config) {
	    	if (i === "global") continue;
	    	// Might need to trail the query string
	    	config._pathMap.push({url: i, config: config[i]});
	    }
		config._pathMap.sort(function(a,b) {
			return b.url.localeCompare(a.url);
		});
	    config._initiated = true;
  }

}
Webda.Service = require("./services/service");

module.exports = Webda;