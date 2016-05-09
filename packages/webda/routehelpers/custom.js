"use strict";
const Executor = require("../services/executor.js");

class CustomRouteHelper extends Executor {

	execute(executor) {
		return Promise.resolve();
	}

	handleResult(data) {
		try {
			// Should parse JSON
	      	var result = JSON.parse(data);		
	      	if (result.code == undefined) {
	      		result.code = 200;
	      	}
	      	if (result.headers == undefined) {
	      		result.headers = {}
	      	}
	      	if (result.headers['Content-Type'] == undefined) {
	      		result.headers['Content-Type'] = 'application/json';
	      	}
	    } catch(err) {
	      	console.log("Error '" + err + "' parsing result: " + data);
	      	throw 500;
		}
		this.writeHead(result.code, result.headers);
		if (result.body != undefined) {
	    	this.write(result.body);
	    }
	    this.end();
	}
}

module.exports = CustomRouteHelper