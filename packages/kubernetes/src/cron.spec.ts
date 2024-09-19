import { suite, test } from "@testdeck/mocha";
import { WebdaTest } from "@webda/core/lib/test";
import * as assert from "assert";
import { CronReplace } from "./cron";

@suite
class CronTest extends WebdaTest {
  @test
  basic() {
    const text = `{
      "value": ["a", "\${cron.argsArray}"],
      "value2": ["a", "\${...cron.args}"],
      "cmdline": "echo 'a' '\${cron.argsLine}'"
    }`;
    let res = JSON.parse(CronReplace(
      text,
      { args: ["b", "c"], cron: "* * * * *", description: "Test", method: "method", serviceName: "service" },
      this.webda.getApplication(),
      {}
    ));
    assert.deepStrictEqual(res.value, ["a", "b", "c"]);
    assert.deepStrictEqual(res.value2, ["a", "b", "c"]);
    assert.strictEqual(res.cmdline, "echo 'a' 'b' 'c'");
    assert.strictEqual(
      CronReplace(`cmdline2:\n  - echo "a" "\${cron.argsLine}"\n`, { args: ["b", "c"], cron: "* * * * *", description: "Test", method: "method", serviceName: "service" },
        this.webda.getApplication()), `cmdline2:\n  - echo "a" "b" "c"\n`);
    res = CronReplace({
      value: [
        "a",
        "${...cron.args}"
      ]
    }, { args: ["b", "c"], cron: "* * * * *", description: "Test", method: "method", serviceName: "service" },
    this.webda.getApplication())
    assert.deepStrictEqual(res.value, ["a", "b", "c"]);
  }
}
