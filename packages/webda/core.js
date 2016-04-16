"use strict";

var http = require('http');
var webda_config = require('./config.json');
var ConfigLoader = require('./configloader.js')
var Router = require('./router.js');
var router = new Router(ConfigLoader());

var express = require('express');
var passport = require('passport');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var session = require('express-session');
var multer = require('multer'); // v1.0.5
var upload = multer(); // for parsing multipart/form-data

function display404(res) {
	res.writeHead(404, {'Content-Type': 'text/plain'});
  	res.write("Webda doesn't know this host or mapping");
  	res.end();	
}

var app = express();
app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(upload.array('file'));
app.use(session({ secret: 'webda-private-key',resave: false,
    saveUninitialized: false }));
app.set('trust proxy', 'loopback, 10.0.0.0/8');

function sleep(time) {
    var stop = new Date().getTime();
    while(new Date().getTime() < stop + time) {
        ;
    }
}

var main_app = function (req, res) {
  // Ensure cookie session
  /*
  if (req.cookies.webda === undefined) {
    req.cookies.webda = {};
  }
  var sessionCookie = new SecureCookie({'secret': 'webda-private-key'}, req.cookies.webda);
  req.session = sessionCookie;
  */

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
    req.hostname = vhost = req.headers['x-forwarded-host'];
  }
  var protocol = req.protocol;
  if (req.headers['x-forwarded-proto'] != undefined) {
    protocol = req.headers['x-forwarded-proto'];
  }

  // Setup the right session cookie
  req.session.cookie.domain = vhost;

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
  var callable = router.getRoute(vhost, req.method, req.url, protocol, req.port, req.headers);
  if (callable == null) {
  	display404(res);
  	return;
  } 
  try {
    callable.init(req, res);
    callable.execute();
  } catch (err) {
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
  return;
};


// respond to all requests
app.use(main_app);

var port = 18080;
http.createServer(app).listen(port);
console.log('Server running at http://127.0.0.1:' + port);
