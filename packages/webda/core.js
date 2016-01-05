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

function display404(res) {
	res.writeHead(404, {'Content-Type': 'text/plain'});
  	res.write("Webda doesn't know this host or mapping");
  	res.end();	
}

var app = express();
app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({ secret: 'webda-private-key',resave: false,
    saveUninitialized: false }));
app.set('trust proxy', 'loopback, 10.0.0.0/8');

main_app = function (req, res) {
  var vhost = ( req.headers.host.match(/:/g) ) ? req.headers.host.slice( 0, req.headers.host.indexOf(":") ) : req.headers.host
  if (req.hostname !== undefined) {
    vhost = req.hostname;
  }
  // Setup the right session cookie
  req.session.cookie.domain = vhost;
  console.log("Searching for a vhost on " + vhost);
  console.log("URL:" + req.url);
  callable = router.getRoute(vhost, req.method, req.url, req.protocol, req.port, req.headers);
  //req.query = req._parsedUrl.search;
  if (callable == null) {
  	display404(res);
  	return;
  } 
  callable.execute(req, res);
  return;
};


// respond to all requests
app.use(main_app);

http.createServer(app).listen(8080);
console.log('Server running at http://127.0.0.1:8080/');
