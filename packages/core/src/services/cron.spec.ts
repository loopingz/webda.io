import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import { Cron, CronDefinition, CronService, Service } from "..";
import { WebdaTest } from "../test";

class MyService extends Service {
  @Cron("0/15 * * * *", "plop")
  test() {
    // Empty one
  }

  @Cron("0/25 * * * *", undefined, "myArg")
  test2(myArg: string) {}
}
@suite
class CronServiceTest extends WebdaTest {
  protected async buildWebda(): Promise<void> {
    await super.buildWebda();
    this.webda.getBeans = () => {};
  }
  @test
  annotations() {
    this.registerService(new MyService(this.webda, "myService", {}));
    let def = new CronDefinition("0/15 * * * *", [], "myService", "test", "plop");
    let service = new CronService(this.webda, "cron", {});
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
