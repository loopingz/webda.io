import { suite, test } from "@webda/test";
import { WebdaApplicationTest } from "@webda/core/lib/test/application.js";
import * as assert from "assert";
import { CronDefinition } from "@webda/core";
import { CronReplace } from "./cron.js";

const CRON: CronDefinition = <CronDefinition>{
  args: ["b", "c"],
  cron: "* * * * *",
  description: "Test",
  method: "method",
  serviceName: "service"
};

@suite
class CronTest extends WebdaApplicationTest {
  @test
  basic() {
    const text = `{
      "value": ["a", "\${cron.argsArray}"],
      "value2": ["a", "\${...cron.args}"],
      "cmdline": "echo 'a' '\${cron.argsLine}'"
    }`;
    let res = JSON.parse(CronReplace(text, CRON, {}));
    assert.deepStrictEqual(res.value, ["a", "b", "c"]);
    assert.deepStrictEqual(res.value2, ["a", "b", "c"]);
    assert.strictEqual(res.cmdline, "echo 'a' 'b' 'c'");
    assert.strictEqual(
      CronReplace(`cmdline2:\n  - echo "a" "\${cron.argsLine}"\n`, CRON),
      `cmdline2:\n  - echo "a" "b" "c"\n`
    );
    res = CronReplace({ value: ["a", "${...cron.args}"] }, CRON);
    assert.deepStrictEqual(res.value, ["a", "b", "c"]);
  }
}
