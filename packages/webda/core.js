var http = require('http');
var AWS = require('aws-sdk'); 
var lambda = new AWS.Lambda();
var webda_config = require('./config.json');

function display404(res) {
	res.writeHead(404, {'Content-Type': 'text/plain'});
  	res.write("Webda doesn't know this host or mapping");
  	res.end();	
}

http.createServer(function (req, res) {
  var vhost = ( req.headers.host.match(/:/g) ) ? req.headers.host.slice( 0, req.headers.host.indexOf(":") ) : req.headers.host
  console.log(JSON.stringify(webda_config['test.webda.io']));
  // Check vhost
  console.log("Searching for a vhost on " + vhost);
  if (webda_config[vhost] === undefined) {
  	display404(res);
  	return;
  }
  // Check mapping
  mapKey = req.method + " " + req.url;
  console.log("Searching for a mapping for " + mapKey);
  if (webda_config[vhost][mapKey] === undefined) {
  	display404(res);
  	return;
  }
  vhost_config = webda_config[vhost]["global"];
  callable = webda_config[vhost][mapKey];
  // Enrich params
  if (vhost_config != undefined) {
	 if (callable["params"] == undefined) {
	  	callable["params"] = vhost_config['params'];
	 } else if (vhost_config['params'] != undefined) {
	  	for (var property in vhost_config['params']) {
	  		if (callable["params"][property] == undefined) {
	  			callable["params"][property] = vhost_config['params'][property];
	  		}
	  	}
	 }
  }
  console.log(req);
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.write("Callable is " + JSON.stringify(callable));
  res.end();
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
