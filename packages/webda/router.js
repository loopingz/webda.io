var uriTemplates = require('uri-templates');
var Executors = require('./executor.js');
var extend = require('util')._extend;

//var module = require("module");
var Router = function(config) {
	var self = this;
	self.config = config;
	// Prepare tbe URI parser
	for (var vhost in this.config) {
		for (var map in this.config[vhost]) {
      if (this.config[vhost][map]._extended) {
        continue;
      }
      if (this.config[vhost][map]["executor"] == undefined) {
          this.config[vhost][map]["executor"] = "_default";
      } else {
        // Validate the Executor type
        if (Executors[this.config[vhost][map]["executor"]] == undefined) {
           throw "Executor type is unknown: '" + this.config[vhost][map]["executor"] + "'";
        }
      }
			if (map.indexOf("{") != -1) {
		    this.config[vhost][map]['uri-template-parse'] = uriTemplates(map);
		  }
      callable = new Executors[this.config[vhost][map]["executor"]](this.config[vhost][map]);
      for (var extMap in callable.enrichRoutes(map)) {
        if (this.config[vhost][extMap] != undefined) {
          continue;
        }
        this.config[vhost][extMap] = extend({}, this.config[vhost][map]);

        if (map.indexOf("{") != -1) {
          this.config[vhost][extMap]['uri-template-parse'] = uriTemplates(extMap);
        }
        this.config[vhost][extMap]._extended = true;
      }
		}
	}
};
Router.prototype = Router;

Router.prototype.initHosts = function(vhost, config) {
  console.log("init stores");
  if (config.global == undefined || config.global.stores == undefined) {
    return;
  }
  stores = require('./store');
  for (store in config.global.stores) {
    storeName = vhost + "_" + store;
    console.log("Adding store: " + storeName);
    stores.add(storeName, config.global.stores[store]);
    if (config.global.stores[store].expose != undefined) {
      expose = config.global.stores[store].expose;
      console.log("typeof " + typeof(expose));
      if (typeof(expose) == "boolean") {
          expose = {};
          expose.url = "/" + store;
      }
      config[expose.url] = {"method": ["POST", "GET"], "executor": "store", "store": storeName, "expose": expose};
      config[expose.url+"/{uuid}"] = {"method": ["GET", "PUT", "DELETE"], "executor": "store", "store": storeName, "uri-template-parse": uriTemplates(expose.url + "/{uuid}")};
    }
  }
  if (config.global == undefined || config.global.validators == undefined) {
    return;
  }
  //require(config.global.validators);
}

Router.prototype.getRoute = function(vhost, method, url, protocol, port, headers) {
  // Check vhost
  if (this.config[vhost] === undefined) {
  	return null;
  } else {
    // Init vhost if needed
    this.initHosts(vhost, this.config[vhost]);
  }
  // Check mapping
  var callable = null;
  if (url.indexOf("?") >= 0) {
    url = url.substring(0, url.indexOf("?"));
  }
  for (var map in this.config[vhost]) {
    if (map == "global") {
      continue;
    }
    console.log("Going through mapping: " + map);
    if  (Array.isArray(this.config[vhost][map]['method'])) {
      if (this.config[vhost][map]['method'].indexOf(method) == -1) {
        continue;
      }
    } else if (this.config[vhost][map]['method'] != method) {
      continue;
    }
    if (map == url) {
      callable = new Executors[this.config[vhost][map]["executor"]](this.config[vhost][map]);
      break;
    }
    if (this.config[vhost][map]['uri-template-parse'] === undefined) {
      continue;
    }
    //console.log(url);
    //console.log(this.config[vhost][map]);
    parse_result = this.config[vhost][map]['uri-template-parse'].fromUri(url);
    //console.log(parse_result);
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
      callable = new Executors[this.config[vhost][map]["executor"]](this.config[vhost][map]);
      callable.enrichParameters(parse_result);
      break;
    }
  }
  if (callable != null) {
  	vhost_config = this.config[vhost]["global"];
  	if (vhost_config['params'] != undefined) {
        callable.enrichParameters(vhost_config['params']);
  	}
    if (callable["_http"] == undefined) {
        callable["_http"] = {"host":vhost, "method":method, "url":url, "protocol": protocol, "port": port, "headers": headers};
    }
  }
  return callable;
};

module.exports = Router.prototype;