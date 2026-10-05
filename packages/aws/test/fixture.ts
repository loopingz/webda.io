import { Service } from "@webda/core";
import { WaitFor, WaitLinearDelay } from "@webda/utils";
import { vi } from "vitest";
import { WebdaApplicationTest } from "@webda/core/lib/test/index.js";

/**
 * Localstack endpoint used by the tests
 */
export const LOCALSTACK = "http://localhost:4566";

/**
 * Credentials accepted by localstack
 */
export const defaultCreds = {
  accessKeyId: "Bouzouf",
  secretAccessKey: "plop"
};

/**
 * Client parameters to target localstack
 */
export const localstackParams = {
  endpoint: LOCALSTACK,
  credentials: defaultCreds,
  region: "us-east-1"
};

let localStack: boolean | undefined = undefined;

/**
 * Ensure localstack is reachable
 *
 * Start it with `docker run -p 4566:4566 -e SERVICES=s3,sts,sqs,dynamodb,secretsmanager,logs localstack/localstack:3.6.0`
 */
export async function checkLocalStack() {
  if (localStack === undefined) {
    try {
      await fetch(LOCALSTACK, { signal: AbortSignal.timeout(10000) });
      localStack = true;
    } catch {
      localStack = false;
    }
  }
  if (!localStack) {
    throw new Error("Require localstack to be started");
  }
}

/**
 * Test service receiving the AWS events dispatched by the LambdaServer
 */
export class AWSEventsHandler extends Service {
  static lastEvents: any[] = [];

  /**
   * @returns the events received so far
   */
  getEvents() {
    return AWSEventsHandler.lastEvents;
  }

  /**
   * @returns true, handle every event
   */
  isAWSEventHandled() {
    return true;
  }

  /**
   * Record the event
   * @param source - the event source
   * @param event - the event
   */
  async handleAWSEvent(source: string, event: any) {
    await new Promise(resolve => setTimeout(resolve, 10));
    AWSEventsHandler.lastEvents.push({ source, event });
  }
}

/**
 * Base test requiring localstack
 */
export class WebdaAwsTest extends WebdaApplicationTest {
  /**
   * Check localstack and set the AWS environment
   */
  async beforeAll() {
    await checkLocalStack();
    process.env.AWS_ACCESS_KEY_ID = defaultCreds.accessKeyId;
    process.env.AWS_SECRET_ACCESS_KEY = defaultCreds.secretAccessKey;
    process.env.AWS_DEFAULT_REGION = "us-east-1";
    await super.beforeAll();
  }
}

/**
 * Make the waits of a deployer immediate
 * @param deployer - the deployer
 */
export function fastWait(deployer: any) {
  vi.spyOn(deployer, "waitFor").mockImplementation((callback, retries, title) =>
    WaitFor(callback, retries, title, undefined, WaitLinearDelay(1))
  );
}
