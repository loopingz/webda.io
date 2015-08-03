var fs = require('fs');

var ConfigLoader = function() {
	var config = null;
	// Default load from file
	if (process.env.WEBDA_CONFIG == undefined) {
		config = './webda-config.json';
		if (fs.existsSync(config)) {
			return require(config);
		}
		config = '/etc/webda-config.json';
		if (fs.existsSync(config)) {
			return require(config);
		}
	}
	// Load from URL
	console.log("Configuration can't be found");
}

module.exports = ConfigLoader