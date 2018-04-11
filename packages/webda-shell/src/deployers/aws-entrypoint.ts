"use strict";
import { LambdaServer } from 'webda';
var lambda = new LambdaServer();

exports.handler = function(event, context, callback) {
  lambda.handleRequest(event, context, callback);
};
