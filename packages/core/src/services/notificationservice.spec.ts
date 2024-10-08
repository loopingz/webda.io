import { suite, test } from "../test/core";
import * as assert from "assert";
import { Service } from "./service";
import { User } from "../models/user";
import { WebdaApplicationTest } from "../test/test";
import { MultiNotificationService, NotificationService } from "./notificationservice";

class FakeNotification extends Service implements NotificationService {
  template: boolean = false;
  user: boolean = false;
  sent: number = 0;

  async hasNotification(notification: string) {
    return this.template;
  }
  async handleNotificationFor(user: User) {
    return this.user;
  }

  async sendNotification(user: User, notification: string, replacements: any): Promise<void> {
    this.sent++;
  }
}

@suite
class NotificationServiceTest extends WebdaApplicationTest {
  service: MultiNotificationService;
  fakeA: FakeNotification;
  fakeB: FakeNotification;

  getTestConfiguration() {
    return {
      parameters: {
        ignoreBeans: true
      },
      services: {}
    };
  }

  async beforeEach() {
    await super.beforeEach();
    this.service = new MultiNotificationService("notif", {
      senders: ["notifA", "notifB"]
    });
    this.fakeA = new FakeNotification("notifA", {});
    this.fakeB = new FakeNotification("notifB", {});
    this.registerService(this.fakeA);
    this.registerService(this.fakeB);
    this.registerService(this.service);
    this.service.resolve();
  }

  @test
  async cov() {
    assert.strictEqual(await this.service.handleNotificationFor(undefined), false);
    assert.strictEqual(await this.service.hasNotification(undefined), false);

    this.fakeB.user = true;
    assert.strictEqual(await this.service.handleNotificationFor(undefined), true);
    this.fakeA.template = true;
    assert.strictEqual(await this.service.hasNotification(undefined), true);

    await this.service.sendNotification(undefined, undefined, undefined);
    assert.strictEqual(this.fakeA.sent + this.fakeB.sent, 0);
    this.fakeA.user = true;
    await this.service.sendNotification(undefined, undefined, undefined);
    assert.strictEqual(this.fakeA.sent + this.fakeB.sent, 1);
    this.fakeB.template = true;
    await this.service.sendNotification(undefined, undefined, undefined);
    assert.strictEqual(this.fakeA.sent + this.fakeB.sent, 2);
    this.service.getParameters().multiple = true;
    await this.service.sendNotification(undefined, undefined, undefined);
    assert.strictEqual(this.fakeA.sent + this.fakeB.sent, 4);
  }

  @test
  async exception() {
    this.service.getParameters().senders.push("unknown");
    assert.throws(() => this.service.resolve(), /Unknown service 'unknown'/);
  }
}
