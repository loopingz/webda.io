import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import { WebdaAwsTest } from "../index.spec";
import { AWSSecretsManager } from "./secretsmanager";

@suite
class SecretsManagerTest extends WebdaAwsTest {
  service: AWSSecretsManager;
  async before() {
    await super.before();
    this.service = <AWSSecretsManager>this.getService("AWSSecretsManager");
    assert.notStrictEqual(this.service, undefined);
    try {
      await this.service.delete("webda-test-unit-test", 7, true);
    } catch (err) {
      // Skip bad delete
    }
    try {
      await this.service.create("webda-test-manual", {
        "webda-test-1": "Test1",
        "webda-test-2": "Test2"
      });
    } catch (err) {
      // Skip as it will fail if it already exists
    }
  }
  async after() {
    await this.service.delete("webda-test-unit-test", 7, true);
  }

  @test
  async basic() {
    let result = await this.service.get("webda-test-manual");
    assert.strictEqual(result["webda-test-1"], "Test1");
    assert.strictEqual(result["webda-test-2"], "Test2");
    let config = await this.service.getConfiguration("webda-test-manual");
    assert.strictEqual(config["webda-test-1"], result["webda-test-1"]);
    assert.strictEqual(config["webda-test-2"], result["webda-test-2"]);
    await this.service.create("webda-test-unit-test", {
      "Authentication.providers.email.text": "Bouzouf"
    });
    result = await this.service.get("webda-test-unit-test");
    assert.strictEqual(result["Authentication.providers.email.text"], "Bouzouf");
    await this.service.put("webda-test-unit-test", {
      "Authentication.providers.email.text": "Bouzouf2"
    });
    result = await this.service.get("webda-test-unit-test");
    assert.strictEqual(result["Authentication.providers.email.text"], "Bouzouf2");
    assert.ok(!this.service.canTriggerConfiguration(undefined, undefined));
    assert.deepStrictEqual(this.service.getARNPolicy("plop"), {
      Action: ["secretsmanager:*"],
      Effect: "Allow",
      Resource: ["arn:aws:secretsmanager:us-east-1:plop:secret:*"],
      Sid: "AWSSecretsManagerAWSSecretsManager"
    });
  }
}
