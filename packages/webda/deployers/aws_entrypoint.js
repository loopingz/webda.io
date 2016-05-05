"use strict";
const LambdaServer = require('./handlers/lambda');
var lambda = new LambdaServer();

exports.handler = function(event, context, callback) {        
        lambda.handleRequest(event, context, callback);
        /*
        var result = {}
        result.code = 200;
        result.context = context;
        //result.method = "METHOD:"+ event.method;
        result.params = event.params;
        result.headers = {};
        result.headers['Content-Type'] = 'text/plain';
        result.event = event;
        result.version = "INLINE";
        context.succeed(result);
        */
};
