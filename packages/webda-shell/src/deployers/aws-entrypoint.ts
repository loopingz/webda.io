"use strict";
import {
  LambdaServer
} from 'webda';
var lambda = new LambdaServer();

exports.handler = async function(event, context) {
  return (await lambda.handleRequest(event, context));
};
