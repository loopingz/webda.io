"use strict";
// Must use require instead of import to avoid https://github.com/microsoft/TypeScript/issues/14538#issuecomment-491126722
const aws = require("@webda/aws");
import { Application } from "@webda/core";

// Create thee LambdaServer
var lambda = new aws.LambdaServer(new Application(process.cwd()));

// Export the handler
exports.handler = async function (event, context) {
  return lambda.handleRequest(event, context);
};
