"use strict";
// Must use require instead of import to avoid https://github.com/microsoft/TypeScript/issues/14538#issuecomment-491126722
const aws = require("@webda/aws");
import { Application } from "@webda/core";

var lambda = new aws.LambdaServer(new Application(process.cwd()));

exports.handler = async function(event, context) {
  return await lambda.handleRequest(event, context);
};
