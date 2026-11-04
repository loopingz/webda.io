import { suite, test } from "@webda/test";
import * as assert from "assert";
import { WebdaInternalTest } from "../test/index.js";
import { DebugSmsSender } from "./debugsmssender.service.js";
import { ServiceParameters } from "./serviceparameters.js";
import type { SmsSender } from "./ismssender.js";

@suite
class DebugSmsSenderTest extends WebdaInternalTest {
  getTestConfiguration() {
    return {};
  }

  @test
  async keepsSentMessagesInMemory() {
    const sender: SmsSender = new DebugSmsSender("sms", new ServiceParameters());
    await sender.send("+15550100089", "123456 is your code");
    await sender.send("+33612345678", "654321 is your code");
    assert.deepStrictEqual((sender as DebugSmsSender).sent, [
      { to: "+15550100089", message: "123456 is your code" },
      { to: "+33612345678", message: "654321 is your code" }
    ]);
  }
}
