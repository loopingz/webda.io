"use strict";
const LambdaServer = require('./handlers/lambda');
var lambda = new LambdaServer();

exports.handler = function(event, context, callback) {        
        lambda.handleRequest(event, context, callback);
};
