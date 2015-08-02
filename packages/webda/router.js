var uriTemplates = require('uri-templates');//
//var module = require("module");
var Router = function(config) {
	var self = this;
	self.config = config;
	// Prepare tbe URI parser
	for (var vhost in this.config) {
		for (var map in this.config[vhost]) {
			if (map.indexOf("{") == -1) {
		        continue;
		    } else {
		        this.config[vhost][map]['uri-template-parse'] = uriTemplates(map);
		    }
		}
	}
};
Router.prototype = Router;

Router.prototype.enrichParameters = function(params1, params2) {
	for (var property in params2) {
    	if (params1[property] == undefined) {
      		params1[property] = params2[property];
    	}
  	}
}
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
      callable = this.config[vhost][map];
      break;
    }
    if (this.config[vhost][map]['uri-template-parse'] === undefined) {
      continue;
    }
    parse_result = this.config[vhost][map]['uri-template-parse'].fromUri(url);
    if (parse_result != undefined) {
      callable = this.config[vhost][map];
      this.enrichParameters(callable["params"], parse_result);
      break;
    }
  }
  if (callable != null) {
  	vhost_config = this.config[vhost]["global"];
  	if (callable["params"] == undefined) {
	  	callable["params"] = vhost_config['params'];
	} else if (vhost_config['params'] != undefined) {
      this.enrichParameters(callable["params"], vhost_config['params']);
	}
  }
  return callable;
};

module.exports = Router.prototype;