import { WebdaTest } from "@webda/core/lib/test";
import * as assert from "assert";
import { AWSSecretsManager } from "./secretsmanager";
import { test, suite, timeout } from "mocha-typescript";

@suite
class SecretsManagerTest extends WebdaTest {
  service: AWSSecretsManager;
  async before() {
    await super.before();
    this.service = <AWSSecretsManager>this.getService("AWSSecretsManager");
    assert.notEqual(this.service, undefined);
    try {
      await this.service.delete("webda-test-unit-test", 7, true);
      // We have to wait for the secret to go away
      await this.sleep(15000);
    } catch (err) {
      // Skip bad delete
    }
  }
  async after() {
    await this.service.delete("webda-test-unit-test", 7, true);
  }

  @test
  async basic() {
    let result = await this.service.get("webda-test-manual");
    assert.equal(result["webda-test-1"], "Test1");
    assert.equal(result["webda-test-2"], "Test2");
    let config = await this.service.getConfiguration("webda-test-manual");
    assert.equal(config["webda-test-1"], result["webda-test-1"]);
    assert.equal(config["webda-test-2"], result["webda-test-2"]);
    await this.service.create("webda-test-unit-test", {
      "Authentication.providers.email.text": "Bouzouf"
    });
    result = await this.service.get("webda-test-unit-test");
    assert.equal(result["Authentication.providers.email.text"], "Bouzouf");
    await this.service.put("webda-test-unit-test", {
      "Authentication.providers.email.text": "Bouzouf2"
    });
    result = await this.service.get("webda-test-unit-test");
    assert.equal(result["Authentication.providers.email.text"], "Bouzouf2");
  }
}
