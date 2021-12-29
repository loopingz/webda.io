import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import { WebdaTest } from "../test";
import { NotificationService, MultiNotificationService } from "./notificationservice";
import { Service } from "..";
import { User } from "../models/user";

class FakeNotification extends Service implements NotificationService {
  template: boolean = false;
  user: boolean = false;
  sent: number = 0;

  async hasTemplate(notification: string) {
    return this.template;
  }
  async handleUser(user: User) {
    return this.user;
  }

  async sendNotification(user: User, notification: string, replacements: any): Promise<void> {
    this.sent++;
  }
}

@suite
class NotificationServiceTest extends WebdaTest {
  service: MultiNotificationService;
  fakeA: FakeNotification;
  fakeB: FakeNotification;

  getTestConfiguration(): string {
    return process.cwd() + "/test/config-invitation.json";
  }

  async before() {
    await super.before();
    this.service = new MultiNotificationService(this.webda, "notif", {
      senders: ["notifA", "notifB"]
    });
    this.fakeA = new FakeNotification(this.webda, "notifA", {});
    this.fakeB = new FakeNotification(this.webda, "notifB", {});
    this.registerService("notifA", this.fakeA);
    this.registerService("notifB", this.fakeB);
    this.registerService("notif", this.service);
    this.service.resolve();
  }

  @test
  async cov() {
    assert.strictEqual(await this.service.handleUser(undefined), false);
    assert.strictEqual(await this.service.hasTemplate(undefined), false);

    this.fakeB.user = true;
    assert.strictEqual(await this.service.handleUser(undefined), true);
    this.fakeA.template = true;
    assert.strictEqual(await this.service.hasTemplate(undefined), true);

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
