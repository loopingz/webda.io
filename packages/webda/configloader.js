var fs = require('fs');

var ConfigLoader = function() {
	var config = null;
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

module.exports = ConfigLoader
