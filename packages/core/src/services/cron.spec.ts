import { suite, test } from "@webda/test";
import * as assert from "assert";
import { Cron, CronDefinition, CronService, Service } from "../index.js";
import { WebdaApplicationTest } from "../test";

class MyService extends Service {
  @Cron("0/15 * * * *", "plop")
  async test() {
    // Empty one
  }

  @Cron("0/25 * * * *", undefined, "myArg")
  async test2(myArg: string) {
    this.calls.push(myArg);
  }

  calls: string[] = [];
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
    const catchCancelled = (err: any) => {
      if (err !== "Cancelled") {
        throw err;
      }
    };
    try {
      let promise = service.work();
      promise.catch(catchCancelled);
      promise.cancel();
      service.enable = false;
      service.schedule("* * * * *", () => {}, "mine");
      service.crons[0].context = undefined;
      promise = service.run();
      promise.catch(catchCancelled);
      promise.cancel();
      promise = service.run(false);
      promise.catch(catchCancelled);
      promise.cancel();
    } finally {
    }
  }
}

@suite
class CronRunTest extends WebdaApplicationTest {
  @test
  async runCronById() {
    const myService = new MyService("myService", {});
    this.registerService(myService);
    try {
      const service = new CronService("cron", {});
      const cron = CronService.loadAnnotations({ myService }).find(c => c.method === "test2");
      const id = CronService.getExportId(cron);
      assert.match(id, /^[0-9a-f]{8}$/);
      // Runs the annotated method with its declared arguments
      await service.runCron(id);
      assert.deepStrictEqual(myService.calls, ["myArg"]);
      // Unknown or missing id fails, so the job exits non-zero
      await assert.rejects(() => service.runCron("deadbeef"), /No cron with id 'deadbeef'/);
      await assert.rejects(() => service.runCron(undefined), /A cron id is required/);
    } finally {
      delete this.webda.getServices()["myService"];
    }
  }
}

@suite
class CronDefinitionTest {
  @test
  testString() {
    assert.strictEqual(new CronDefinition("* * * * *").toString(), "* * * * *: .()");
    console.log(JSON.stringify(new CronDefinition("* * * * *")));
    assert.strictEqual(CronService.getCronId(new CronDefinition("* * * * *"), "plop"), "17e49a53");
    assert.strictEqual(
      new CronDefinition("* * * * *", [{}, {}], "plop", "method", "desc").toString(),
      "* * * * *: plop.method([object Object],[object Object]) # desc"
    );
  }
}
