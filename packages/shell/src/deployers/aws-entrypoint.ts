"use strict";
import { LambdaServer } from "@webda/aws";
import { Application } from "@webda/core";

var lambda = new LambdaServer(new Application(process.cwd()));

exports.handler = async function(event, context) {
  return await lambda.handleRequest(event, context);
};
