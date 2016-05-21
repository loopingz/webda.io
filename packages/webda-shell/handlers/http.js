"use strict";
var Webda = require(__webda + '/core');
var SecureCookie = require(__webda + '/utils/cookie');
var _extend = require("util")._extend;

class WebdaServer extends Webda {

	constructor (param) {
		super(param);
	}

	handleRequest (req, res) {
	  // Ensure cookie session
	  if (req.cookies.webda === undefined) {
		req.cookies.webda = {};
	  }
	  var sessionCookie = new SecureCookie({'secret': 'webda-private-key'}, req.cookies.webda).getProxy();
	  req.session = sessionCookie;

	  // Add correct headers for X-scripting
	  if (req.headers['x-forwarded-server'] === undefined) {
		res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5000');
	  }
	  res.setHeader('Access-Control-Allow-Credentials', 'true');
	  // Handle reverse proxy
	  var vhost = ( req.headers.host.match(/:/g) ) ? req.headers.host.slice( 0, req.headers.host.indexOf(":") ) : req.headers.host
	  if (req.hostname !== undefined) {
		vhost = req.hostname;
	  }
	  if (req.headers['x-forwarded-host'] !== undefined) {
		vhost = req.headers['x-forwarded-host'];
	  }
	  var protocol = req.protocol;
	  if (req.headers['x-forwarded-proto'] != undefined) {
		protocol = req.headers['x-forwarded-proto'];
	  }

	  // Setup the right session cookie
	  //req.session.cookie.domain = vhost;

	  if (req.method == "OPTIONS") {
		var methods = 'GET,POST,PUT,DELETE,OPTIONS';
		res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
		res.setHeader('Access-Control-Allow-Methods', methods);
		res.setHeader('Allow', methods);
		res.writeHead(200);
		res.end();
		return;
	  }
	  	var ctx = this.newContext(req.body, req.session, res, req.files);
	  	var executor = this.getExecutor(ctx, vhost, req.method, req.url, protocol, req.port, req.headers);
		if (executor == null) {
			this.display404(res);
			return;
		} 
		return Promise.resolve(executor.execute(ctx)).then( () => {
			if (!ctx._ended) {
				ctx.end();
			}
		}).catch ((err) => {
			if (typeof(err) === "number") {
				ctx.statusCode = err;
				this.flushHeaders(ctx);
				res.end();
			} else {
				console.log("Exception occured : " + JSON.stringify(err));
				console.log(err.stack);
				res.writeHead(500);
				res.end();
				throw err;
			}
		});
	}

	display404(res) {
		res.writeHead(404, {'Content-Type': 'text/plain'});
		res.write("Webda doesn't know this host or mapping");
		res.end();	
	}

	updateSecret () {

	}

	flushHeaders (ctx) {
		var res = ctx._stream;
		var headers = ctx._headers;
		headers['Set-Cookie'] = this.getCookieHeader(ctx);
		res.writeHead(ctx.statusCode, headers);
	}

	flush (ctx) {
		var res = ctx._stream;
		if (ctx._body !== undefined) {
			res.write(ctx._body);
		}
		res.end();
	}

	getSecret () {
		return 'webda-private-key';
	}

	serve (port) {
		var http = require('http');
		var express = require('express');
		var cookieParser = require('cookie-parser');
		var bodyParser = require('body-parser');
		var multer = require('multer'); // v1.0.5
		var upload = multer(); // for parsing multipart/form-data

		var app = express();
		app.use(cookieParser());
		app.use(bodyParser.text({ type: 'text/plain' }));
		app.use(bodyParser.json());
		app.use(bodyParser.urlencoded({ extended: true }));
		app.use(upload.array('file'));
		// Will lower the limit soon, we should have a library that handle multipart file
		app.use(bodyParser.raw({type: '*/*', limit: '50mb'}));

		app.set('trust proxy', 'loopback, 10.0.0.0/8');
		app.use(this.handleRequest.bind(this));

		this._http = http.createServer(app).listen(port);
		console.log('Server running at http://0.0.0.0:' + port);
	}
};

/**
const cluster = require('cluster');
const http = require('http');
const numCPUs = require('os').cpus().length;

if (cluster.isMaster) {
  // Fork workers.
  for (var i = 0; i < numCPUs; i++) {
	cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
	console.log(`worker ${worker.process.pid} died`);
  });
} else {
  // Workers can share any TCP connection
  // In this case it is an HTTP server
  http.createServer((req, res) => {
	res.writeHead(200);
	res.end('hello world\n');
  }).listen(8000);
}
 **/

module.exports = WebdaServer
