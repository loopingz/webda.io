var http = require('http');
var AWS = require('aws-sdk'); 
var lambda = new AWS.Lambda();
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
  // Call the lambda function mapped
  var params = {
    FunctionName: callable['lambda'], /* required */
    ClientContext: JSON.stringify(callable['params']),
    InvocationType: 'RequestResponse',
    LogType: 'None',
    Payload: req.data// not sure here / new Buffer('...') || 'STRING_VALUE'
  };
  lambda.invoke(params, function(err, data) {
    if (err) {
      console.log(err, err.stack);
      res.writeHead(500, {'Content-Type': 'text/plain'});
      res.end();
      return;
    }
    if (data.Payload != '{}') {
      // Should parse JSON
      res.writeHead(200, {'Content-Type': 'text/plain'});
      res.write(data.Payload);
      res.end();
    }
  });
  //res.writeHead(200, {'Content-Type': 'text/plain'});
  //res.end('Hello World\n');
}).listen(1337, '127.0.0.1');
console.log('Server running at http://127.0.0.1:1337/');
