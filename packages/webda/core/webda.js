"use strict";

var uriTemplates = require('uri-templates');
var extend = require('util')._extend;
var vm = require('vm');
var fs = require('fs');

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
		this._executors = {};
		this._executors['debug']=require('../executors/executor');
		this._executors['lambda']=require('../executors/lambda');
		this._executors['custom']=require('../executors/custom');
		this._executors['inline']=require('../executors/inline');
		this._executors['string']=require('../executors/string');
		this._executors['resource']=require('../executors/resource');
		this._executors['file']=require('../executors/file');
		this._services = {};
		this._services['Authentication']=require('../services/passport');
		this._services['FileStore']=require('../stores/file');
		this._services['MongoStore']=require('../stores/mongodb');
		this._services['DynamoStore']=require('../stores/dynamodb');
		this._services['FileBinary']=require('../services/filebinary');
		this._services['S3Binary']=require('../services/s3binary');
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
				console.log("load config.js");
				return require(config);
			}
		}
		var result = null;
		// Default load from file
		if (process.env.WEBDA_CONFIG == undefined) {
			config = './webda.config.js';
			if (fs.existsSync(config)) {
				console.log("load config.js");
				return require('.' + config);
			}
			config = './webda-config.json';
			if (fs.existsSync(config)) {
				console.log("load webda-config.json");
				return require('.' + config);
			}
			config = '/etc/webda/config.json';
			if (result == undefined && fs.existsSync(config)) {
				console.log("load " + config);
				return require(config);
			}
		} else {
			console.log("load " + process.env.WEBDA_CONFIG);
			return require(process.env.WEBDA_CONFIG);
		}
	}

	setHost(host) {
		this._vhost = host
	}

	getService(name, mapper) {
		if (name === undefined) {
			name = "_default";
		}
		if (this._config[this._vhost] !== undefined) {
			if (this._config[this._vhost].global !== undefined && this._config[this._vhost].global.services !== undefined
					&& this._config[this._vhost].global.services[name]) {
				return this._config[this._vhost].global.services[name]._service;
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
	    var callable = null;
	    var params = [];
	    if (url.indexOf("?") >= 0) {
	      url = url.substring(0, url.indexOf("?"));
	    }
	    for (var map in this._config[vhost]) {
	      if (map == "global") {
	        continue;
	      }
	      if  (Array.isArray(this._config[vhost][map]['method'])) {
	        if (this._config[vhost][map]['method'].indexOf(method) == -1) {
	          continue;
	        }
	      } else if (this._config[vhost][map]['method'] != method) {
	        continue;
	      }
	      if (map == url) {
	        callable = this.getCallable(this._config[vhost][map]["executor"], this._config[vhost][map]);
	        break;
	      }
	      if (this._config[vhost][map]['_uri-template-parse'] === undefined) {
	        continue;
	      }
	      var parse_result = this._config[vhost][map]['_uri-template-parse'].fromUri(url);
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
	        callable = this.getCallable(this._config[vhost][map]["executor"], this._config[vhost][map], parse_result);
	        break;
	      }
	    }
	    if (callable != null) {
	    	var vhost_config = this._config[vhost]["global"];
	    	if (vhost_config['params'] != undefined) {
	          callable.enrichParameters(vhost_config['params']);
	    	}
	        callable["_http"] = {"host":vhost, "method":method, "url":url, "protocol": protocol, "port": port, "headers": headers, "wildcard": wildcard};
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
	      	var params = extend({}, config.global.params);
	      	params = extend(params, services[service]);
	      	delete params.require;
	      	try {
	      		services[service]._service = new serviceConstructor(this, service, params);
	      	} catch (err) {
	      		
	      	}
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
Webda.Service = require("../services/service");

module.exports = Webda;