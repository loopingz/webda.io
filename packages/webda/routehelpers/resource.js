"use strict";
const Executor = require('../services/executor.js');

class ResourceRouteHelper extends Executor {

	execute() {
		return new Promise( function(resolve, reject) {
			var self = this;
			fs.readFile(this.callable.file, 'utf8', function (err,data) {
			  if (err) {
			    return reject(err);
			  }
			  var mime_file = mime.lookup(self.callable.file);
			  console.log("Send file('" + mime_file + "'): " + self.callable.file);
			  if (mime_file) {
			  	this.writeHead(200, {'Content-Type': mime_file});
			  }
			  this.write(data);
			  this.end();
			  return resolve();
			});
		});
	}
}

module.exports = ResourceRouteHelper