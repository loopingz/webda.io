"use strict";
var Webda = require('../core');
var SecureCookie = require('../utils/cookie');
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
	  var sessionCookie = new SecureCookie({'secret': 'webda-private-key'}, req.cookies.webda);
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

	  console.log("Searching for a vhost on " + vhost + " for " + req.url);
	  if (req.method == "OPTIONS") {
		var methods = 'GET,POST,PUT,DELETE,OPTIONS';
		res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
		res.setHeader('Access-Control-Allow-Methods', methods);
		res.setHeader('Allow', methods);
		res.writeHead(200);
		res.end();
		return;
	  }
	  var callable = this.getExecutor(vhost, req.method, req.url, protocol, req.port, req.headers);
	  if (callable == null) {
		this.display404(res);
		return;
	  } 
		callable.context(req.body, req.session, res);
		return Promise.resolve(callable.execute()).then( () => {
			if (!callable._ended) {
				callable.end();
			}
		}).catch ((err) => {
			this.handleError(err, res);	
		});
	}

	handleError(err, res) {
		if (typeof(err) === "number") {
			res.writeHead(err);
			res.end();
		} else {
			console.log("Exception occured : " + JSON.stringify(err));
			console.log(err.stack);
			res.writeHead(500);
			res.end();
			throw err;
		}
	}

	display404(res) {
		res.writeHead(404, {'Content-Type': 'text/plain'});
		res.write("Webda doesn't know this host or mapping");
		res.end();	
	}

	updateSecret () {

	}

	flushHeaders (executor) {
		var res = executor._stream;
		var headers = executor._headers;
		var session = executor.session;
		//_extend(headers, )
		var domain = ";domain=" + executor._http.host;
		if (executor._http.wildcard) {
			domain = '';
		}
		headers['Set-Cookie']='webda=' + session.save() + domain + ";httponly;";
		res.writeHead(executor._returnCode, headers);
	}

	flush (executor) {
		var res = executor._stream;
		if (executor._body !== undefined) {
			res.write(executor._body);
		}
		res.end();
	}

	getSecret () {
		return 'webda-private-key';
	}

	serve (port) {
		var http = require('http');
		var express = require('express');
		var passport = require('passport');
		var cookieParser = require('cookie-parser');
		var bodyParser = require('body-parser');
		var session = require('express-session');
		var multer = require('multer'); // v1.0.5
		var upload = multer(); // for parsing multipart/form-data

		var app = express();
		app.use(cookieParser());
		app.use(bodyParser.json());
		app.use(bodyParser.urlencoded({ extended: true }));
		app.use(upload.array('file'));
		//app.use(session({ secret: this.getSecret(), resave: false, saveUninitialized: false }));
		app.set('trust proxy', 'loopback, 10.0.0.0/8');
		app.use(this.handleRequest.bind(this));

		http.createServer(app).listen(port);
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