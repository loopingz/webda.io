"use strict";

var uriTemplates = require('uri-templates');
var _extend = require('util')._extend;
var vm = require('vm');
var fs = require('fs');
const path = require('path');
const cookieSerialize = require("cookie").serialize;

/**
 * This is the main class of the framework, it handles the routing, the services initialization and resolution
 *
 * @class Webda
 */
class Webda {
	/**
	 * @params {Object} config - The configuration Object, if undefined will load the configuration file
	 */
	constructor (config) {
		/** @ignore */
		this._vhost = '';
		// on the spot routehelpers
		this._routehelpers = {};
		this._routehelpers['debug']=require('./services/executor');
		this._routehelpers['lambda']=require('./routehelpers/lambda');
		this._routehelpers['inline']=require('./routehelpers/inline');
		this._routehelpers['string']=require('./routehelpers/string');
		this._routehelpers['resource']=require('./routehelpers/resource');
		this._routehelpers['file']=require('./routehelpers/file');
		// real service
		this._services = {};
		this._services['Webda/Authentication']=require('./services/passport');
		this._services['Webda/FileStore']=require('./stores/file');
		this._services['Webda/MongoStore']=require('./stores/mongodb');
		this._services['Webda/DynamoStore']=require('./stores/dynamodb');
		this._services['Webda/FileBinary']=require('./services/filebinary');
		this._services['Webda/S3Binary']=require('./services/s3binary');
		this._services['Webda/Mailer']=require('./services/mailer');
		this._config = this.loadConfiguration(config);
	}

	/**
	 * Execute a file in sandbox mode
	 *
	 * @param {Object} executor The executor to give to the file
	 * @param {String} path The path of the file to executre
	 */
	require(executor, path) {
		var code = fs.readFileSync(require.resolve(path));
		this.sandbox(executore, code);
	}

	/**
	 *
	 * @param {Object} executor The executor to expose as executor
	 * @param {String} code to execute
	 */
	sandbox(executor, code) {
		var sandbox = {
			// Should be custom console
			console : console,
			webda: executor._webda,
			executor: executor,
			module  : {},
			require : function(mod) {
				// We need to add more control here
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

	/**
	 * Load the configuration, 
	 *
	 * @protected
	 * @ignore Useless for documentation
	 * @param {Object|String} 
	 */
	loadConfiguration(config) {
		if (typeof(config) === 'object') {
			return config;
		}
		var fs = require('fs');
		if (config !== undefined) {
			if (fs.existsSync(config)) {
				console.log("Load " + config);
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

	/**
	 * Init a specific vhost and set the context to this vhost
	 *
	 * @protected
	 * @ignore
	 */
	setHost(vhost) {
		this._vhost = vhost
		this.initHosts(vhost, this._config[vhost]);
	}

	/**
	 * Get the current session object
	 *
	 * @returns A session object
	 */
	getSession() {
		return this._currentExecutor.session;
	}

	/**
	 * Get a new session object initiate with the data object
	 * Can be used to create short term encrypted data, the keys of the session should be refresh frequently
	 * 
	 * @returns A new session
	 */
	getNewSession(data) {
		const SecureCookie = require("./utils/cookie.js");
		return new SecureCookie({secret: 'WebdaSecret'}, data);
	}

	/**
	 * Check for a service name and return the wanted singleton or undefined if none found
	 *
	 * @param {String} name The service name to retrieve
	 */
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

	/**
	 * Get the route from a method / url
	 * @private
	 */
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

	/**
	 * Get the executor corresponding to a request
	 * It can be usefull in unit test so you can test the all stack
	 *
	 * @protected
	 * @param {String} vhost The host for the request
	 * @param {String} method The http method
	 * @param {String} url The url path
	 * @param {String} protocol http or https
	 * @param {String} port Port can be usefull for auto redirection
	 * @param {Object} headers The headers of the request
	 */
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

	/**
	 * This should return a "turning" secret with cache and a service to modify it every x mins
	 * WARNING The security is lower without this "turning" secret, you can still set the global.secret parameter
	 *
	 * Dont rely on this method, it will probably disapear to avoid secret leak 
	 *
	 * @deprecated
	 * @returns {String} Current secret
	 */
	getSecret() {
		// For now a static config file but should have a rolling service secret
		return this._config[this._vhost].global.secret;
	}

	/**
	 * @private
	 */
	getServiceWithRoute(route) {
		var name = route.executor;
		var executor = this.getService(name);
		// If no service is found then check for routehelpers
		if (executor === undefined && this._routehelpers[name] !== undefined) {
			executor = new this._routehelpers[name](this, name, this._config[route._http.host].global.params);
		}
		if (executor !== undefined) {
	    	executor.setRoute(this.extendParams(route, this._config[route._http.host].global));
	    }
	    return executor;
	}

	/**
	 * @private
	 */
	initURITemplates(config) {
		// Prepare tbe URI parser
	  	for (var map in config) {
		  	if (map.indexOf("{") != -1) {
		  		config[map]['_uri-template-parse'] = uriTemplates(map);
	  		}
	  	}
	}

	/**
	 * Flush the headers to the response, no more header modification is possible after that
	 * @abstract
	 */
	flushHeaders(executor) {
		console.log("Abstract implementation of Webda");
	}

	/**
	 * Flush the entire response to the client
	 */
	flush(executor) {
		console.log("Abstract implementation of Webda");
	}

	/**
  	 * Launch the executor and save it
	 * @ignore
	 * @protected
	 */
	execute(executor) {
		this._currentExecutor = executor;
		return executor.execute();
	}

	/**
	 * Handle the 404
	 * @ignore
	 * @protected
	 */
	handle404() {

	}

	/**
	 * @private
	 */
	extendParams(local, wider) {
		var params = _extend({}, wider);
		return _extend(params, local);
	}

	/**
	 * Encode the cookie into a header form
	 *
	 * @ignore
	 * @protected
	 */
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

	/**
	 * @ignore
	 *
	 */
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
	    	if (type.indexOf('/') < 2) {
	    		type = "Webda/" + type;
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
	      		config.global.services[service]._createException = err;
	      	}
	    }

	    // Init services
	    for (var service in config.global._services) {
	      	if (config.global._services[service].init !== undefined) {
	      		try {
	        		config.global._services[service].init(config);
	        	} catch (err) {
	        		config.global._services[service]._initException = err;
	        	}
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

	initModdas(config) {
		// Moddas are the custom type of service
		// They are either coming from npm or are direct lambda feature or local with require
		if (config.global.moddas === undefined) return;

		for (let i in config.global.moddas) {
			let modda = config.global.moddas[i];
			if (modda.type == "local") {
				// Add the required type
				this._services[i] = require(modda.require);
			} else if (modda.type == "lambda") {
				// This should start the lambda
				this._services[i] = require('./routehelpers/lambda');
				this._services[i]._arn = modda.arn;
			} else if (modda.type == "npm") {
				// The package should export the default
				this._services[i] = require(modda.package);
			}
		}
	}

	initHosts(vhost, config) {
	    if (config._initiated) {
	      return;
	    }
	    
	    this.initModdas(config);

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