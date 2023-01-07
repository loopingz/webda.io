import { suite, test } from "@testdeck/mocha";
import { WebdaTest } from "@webda/core/lib/test";
import * as assert from "assert";
import { CronReplace } from "./cron";

@suite
class CronTest extends WebdaTest {
  @test
  basic() {
    let res = CronReplace(
      {
        value: ["a", "${...cron.args}"]
      },
      { args: ["b", "c"], cron: "* * * * *", description: "Test", method: "method", serviceName: "service" },
      this.webda.getApplication(),
      {}
    );
    assert.deepStrictEqual(res.value, ["a", "b", "c"]);
  }
}
