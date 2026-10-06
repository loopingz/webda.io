import { Application, Core, InstanceStorage, runWithInstanceStorage, useInstanceStorage } from "@webda/core";
import type { Context as LambdaContext } from "aws-lambda";
import { LambdaServer } from "../services/lambdaserver.service.js";

/**
 * A booted packaged application
 */
export interface LambdaApplication {
  /**
   * The LambdaServer handling the invocations
   */
  lambda: LambdaServer;
  /**
   * The instance storage the application was booted in, every invocation runs within it
   */
  instance: InstanceStorage;
}

/**
 * The packaged application, booted on the first invocation
 */
let booted: Promise<LambdaApplication> | undefined;

/**
 * Boot the packaged application in its own instance storage and return its LambdaServer
 *
 * @param appPath - the packaged application folder
 * @returns the LambdaServer service and its instance storage
 */
export function bootLambdaServer(
  appPath: string = process.env["LAMBDA_TASK_ROOT"] || process.cwd()
): Promise<LambdaApplication> {
  return runWithInstanceStorage({}, async () => {
    const app = new Application(appPath);
    useInstanceStorage().application = app;
    await app.load();
    const core = new Core(app);
    await core.init();
    const services = Object.values(core.getServices());
    const lambda = (services.find(service => service instanceof LambdaServer) ??
      services.find(service => service?.constructor?.name === "LambdaServer")) as LambdaServer;
    if (!lambda) {
      throw new Error("No LambdaServer service found in the packaged application");
    }
    return { lambda, instance: useInstanceStorage() };
  });
}

/**
 * Lambda handler: the default `Handler` of the CloudFormation deployer
 *
 * The application is booted once, every invocation runs within its instance storage
 *
 * @param event - the Lambda event
 * @param context - the Lambda context
 * @returns the API Gateway result for HTTP requests
 */
export async function handler(event: any, context: LambdaContext): Promise<any> {
  booted ??= bootLambdaServer().catch(err => {
    // Allow a later invocation to retry the boot
    booted = undefined;
    throw err;
  });
  const { lambda, instance } = await booted;
  return runWithInstanceStorage(instance, () => lambda.handleRequest(event, context));
}
