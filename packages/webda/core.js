var http = require('http');
var webda_config = require('./config.json');
var ConfigLoader = require('./configloader.js')
var Router = require('./router.js');
var router = new Router(ConfigLoader());

function display404(res) {
	res.writeHead(404, {'Content-Type': 'text/plain'});
  	res.write("Webda doesn't know this host or mapping");
  	res.end();	
}

http.createServer(function (req, res) {
  var vhost = ( req.headers.host.match(/:/g) ) ? req.headers.host.slice( 0, req.headers.host.indexOf(":") ) : req.headers.host
  console.log("Searching for a vhost on " + vhost);
  callable = router.getRoute(vhost, req.method, req.url);
  if (callable == null) {
  	display404(res);
  	return;
  } 
  callable.execute(res);
  return;
}).listen(1337, '127.0.0.1');
console.log('Server running at http://127.0.0.1:1337/');
