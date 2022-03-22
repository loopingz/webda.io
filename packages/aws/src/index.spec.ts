import { TestApplication, WebdaTest } from "@webda/core/lib/test";
import * as fetch from "node-fetch";
import * as path from "path";

var localStack = undefined;

export async function checkLocalStack() {
  if (localStack === undefined) {
    try {
      let res = await fetch("http://localhost:4572", {
        timeout: 500
      });
      localStack = true;
    } catch (err) {
      localStack = false;
    }
  }
  if (!localStack) {
    throw new Error("Require localstack to be started");
  }
}

export class WebdaAwsTest extends WebdaTest {
  async tweakApp(app: TestApplication) {
    super.tweakApp(app);
    app.addService("Test/AWSEvents", await import(path.join(__dirname, ..."../test/moddas/awsevents.js".split("/"))));
  }

  async before() {
    await checkLocalStack();
    await super.before();
  }
}
