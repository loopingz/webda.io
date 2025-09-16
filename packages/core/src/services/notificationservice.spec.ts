import { beforeEach, suite, test } from "@webda/test";
import * as assert from "assert";
import { Service } from "./service";
import { User } from "../models/user";
import { WebdaApplicationTest } from "../test/application";
import { MultiNotificationParameters, MultiNotificationService, NotificationService } from "./notificationservice";
import { ServiceParameters } from "../interfaces";

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
    this.service = new MultiNotificationService(
      "notif",
      new MultiNotificationParameters().load({
        senders: ["notifA", "notifB"]
      })
    );
    this.fakeA = new FakeNotification("notifA", new ServiceParameters()).resolve();
    this.fakeB = new FakeNotification("notifB", new ServiceParameters()).resolve();
    this.registerService(this.fakeA);
    this.registerService(this.fakeB);
    this.registerService(this.service);
    this.service.resolve();
  }

  @test
  async cov() {
    assert.strictEqual(await this.service.handleNotificationFor(undefined as any), false);
    assert.strictEqual(await this.service.hasNotification(undefined as any), false);

    this.fakeB.user = true;
    assert.strictEqual(await this.service.handleNotificationFor(undefined as any), true);
    this.fakeA.template = true;
    assert.strictEqual(await this.service.hasNotification(undefined as any), true);

    await this.service.sendNotification(undefined as any, undefined as any, undefined as any);
    assert.strictEqual(this.fakeA.sent + this.fakeB.sent, 0);
    this.fakeA.user = true;
    await this.service.sendNotification(undefined as any, undefined as any, undefined as any);
    assert.strictEqual(this.fakeA.sent + this.fakeB.sent, 1);
    this.fakeB.template = true;
    await this.service.sendNotification(undefined as any, undefined as any, undefined as any);
    assert.strictEqual(this.fakeA.sent + this.fakeB.sent, 2);
    this.service.getParameters().multiple = true;
    await this.service.sendNotification(undefined as any, undefined as any, undefined as any);
    assert.strictEqual(this.fakeA.sent + this.fakeB.sent, 4);
  }

  @test
  async exception() {
    this.service.getParameters().senders.push("unknown");
    assert.throws(() => this.service.resolve(), /Unknown service 'unknown'/);
  }
}
