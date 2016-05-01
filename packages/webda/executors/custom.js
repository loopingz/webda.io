"use strict";
const Executor = require("./executor.js");

class CustomExecutor extends Executor {
	constructor(webda, name, params) {
		super(webda, name, params);
		this._type = "CustomExecutor";
	}

	execute(executor) {
		this.params["_http"] = this._http;
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
	      	if (result.code == 200 && (result.content == undefined || result.content == "")) {
	      		result.code = 204;
	      	}
	    } catch(err) {
	      	console.log("Error '" + err + "' parsing result: " + data);
	      	throw 500;
		}
		this.writeHead(result.code, result.headers);
		if (result.content != undefined) {
	    	this.write(result.content);
	    }
	    this.end();
	}
}

module.exports = CustomExecutor