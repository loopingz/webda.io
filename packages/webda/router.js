var uriTemplates = require('uri-templates');
var Executors = require('./executor.js')
//var module = require("module");
var Router = function(config) {
	var self = this;
	self.config = config;
	// Prepare tbe URI parser
	for (var vhost in this.config) {
		for (var map in this.config[vhost]) {
      if (this.config[vhost][map]["executor"] == undefined) {
          this.config[vhost][map]["executor"] = "_default";
      } else {
        // Validate the Executor type
        if (Executors[this.config[vhost][map]["executor"]] == undefined) {
           throw "Executor type is unknown: '" + this.config[vhost][map]["executor"] + "'";
        }
      }
			if (map.indexOf("{") == -1) {
		        continue;
		    } else {
		        this.config[vhost][map]['uri-template-parse'] = uriTemplates(map);
		    }
		}
	}
};
Router.prototype = Router;

Router.prototype.getRoute = function(vhost, method, url) {
  // Check vhost
  if (this.config[vhost] === undefined) {
  	return null;
  }
  // Check mapping
  var callable = null;
  for (var map in this.config[vhost]) {
    if (this.config[vhost][map]['method'] != method) {
      continue;
    }
    if (map == url) {
      callable = new Executors[this.config[vhost][map]["executor"]](this.config[vhost][map]);
      break;
    }
    if (this.config[vhost][map]['uri-template-parse'] === undefined) {
      continue;
    }
    parse_result = this.config[vhost][map]['uri-template-parse'].fromUri(url);
    if (parse_result != undefined) {
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
        callable["_http"] = {"host":vhost, "method":method, "url":url};
    }
  }
  return callable;
};

module.exports = Router.prototype;