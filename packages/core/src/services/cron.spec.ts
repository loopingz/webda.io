import { suite, test } from "../test/core";
import * as assert from "assert";
import { Cron, CronDefinition, CronService, Service } from "../index";
import { WebdaApplicationTest } from "../test/test";

class MyService extends Service {
  @Cron("0/15 * * * *", "plop")
  test() {
    // Empty one
  }

  @Cron("0/25 * * * *", undefined, "myArg")
  test2(myArg: string) {}
}
@suite
class CronServiceTest extends WebdaApplicationTest {
  @test
  annotations() {
    this.registerService(new MyService("myService", {}));
    const def = new CronDefinition("0/15 * * * *", [], "myService", "test", "plop");
    const service = new CronService("cron", {});
    service.schedule("* * * * *", () => {}, "mine");
    assert.deepStrictEqual(service.getCrontab()[1], def);
    // for cov
    assert.deepStrictEqual(service.getCrontab()[1], def);
    service.crontabSchedule = (cron, cb) => {
      try {
        cb();
      } catch (err) {}
    };
    try {
      let promise = service.work();
      promise.cancel();
      service.enable = false;
      service.schedule("* * * * *", () => {}, "mine");
      service.crons[0].context = undefined;
      promise = service.run();
      promise.cancel();
      promise = service.run(false);
      promise.cancel();
    } finally {
    }
  }
}

@suite
class CronDefinitionTest {
  @test
  testString() {
    assert.strictEqual(new CronDefinition("* * * * *").toString(), "* * * * *: .()");
    assert.strictEqual(CronService.getCronId(new CronDefinition("* * * * *"), "plop"), "5e281c06");
    assert.strictEqual(
      new CronDefinition("* * * * *", [{}, {}], "plop", "method", "desc").toString(),
      "* * * * *: plop.method([object Object],[object Object]) # desc"
    );
  }
}
