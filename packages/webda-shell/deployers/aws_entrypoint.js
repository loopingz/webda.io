"use strict";
const LambdaServer = require('webda/handlers/lambda');
var lambda = new LambdaServer();

exports.handler = function (event, context, callback) {
  lambda.handleRequest(event, context, callback);
};
