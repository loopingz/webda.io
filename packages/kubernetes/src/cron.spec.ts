import { suite, test } from "@webda/test";
import { WebdaApplicationTest } from "@webda/core/lib/test/application.js";
import * as assert from "assert";
import { CronDefinition } from "@webda/core";
import { CronReplace } from "./cron.js";

const CRON = new CronDefinition("* * * * *", { full: true }, "service", "method", "Test", "Service.Method");

@suite
class CronTest extends WebdaApplicationTest {
  @test
  basic() {
    const text = `{
      "name": "\${cron.operationName.toLowerCase()}",
      "operation": "\${cron.operationId}",
      "input": "\${cron.inputb64}"
    }`;
    const res = JSON.parse(CronReplace(text, CRON, {}));
    assert.strictEqual(res.name, "service-method");
    assert.strictEqual(res.operation, "Service.Method");
    assert.deepStrictEqual(JSON.parse(Buffer.from(res.input, "base64").toString()), { full: true });
    assert.strictEqual(CronReplace(`input: '\${cron.inputJson}'\n`, CRON), `input: '{"full":true}'\n`);
    assert.deepStrictEqual(CronReplace({ value: ["a", "${cron.operationId}"] }, CRON), {
      value: ["a", "Service.Method"]
    });
    // A cron without input exposes an empty one
    const noInput = new CronDefinition("* * * * *", null, "service", "method", "", "Service.Method");
    assert.strictEqual(CronReplace("${cron.inputJson}", noInput), "{}");
  }
}
