// Must use require instead of import to avoid https://github.com/microsoft/TypeScript/issues/14538#issuecomment-491126722
// Revisit above comment
// @ts-ignore
import { LambdaServer } from "@webda/aws";
import { Application } from "@webda/core";

// Create thee LambdaServer
const lambda = new LambdaServer(new Application(process.cwd()));

// Export the handler
export async function handler(event, context) {
  return lambda.handleRequest(event, context);
}
