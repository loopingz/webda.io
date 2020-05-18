import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import { CoreModel } from "../models/coremodel";
import { Store } from "../stores/store";
import { WebdaTest } from "../test";
import { ConfigurationService } from "./configuration";

@suite
class ConfigurationServiceTest extends WebdaTest {
  getTestConfiguration() {
    return __dirname + "/../../test/config-reload.json";
  }
  async before() {
    await super.before();
    await this.webda.getService("ConfigurationStore").__clean();
    await this.webda.init();
  }
  async after() {
    await this.webda.getService("ConfigurationStore").__clean();
    (<ConfigurationService>this.webda.getService("ConfigurationService")).stop();
  }
  @test
  async initialLoad() {
    assert.equal(this.webda.getConfiguration().services.Authentication.providers.email.text, "Test");
    assert.equal(this.webda.getConfiguration().services.Authentication.providers.email.mailer, "DefinedMailer");
    let test = {
      uuid: "test",
      "Authentication.providers.email.text": "Plop"
    };
    let store: Store<CoreModel> = <Store<CoreModel>>this.webda.getService("ConfigurationStore");
    await store.save(test);
    await this.sleep(2100);
    assert.equal(this.webda.getConfiguration().services.Authentication.providers.email.text, "Plop");
    assert.equal(this.webda.getConfiguration().services.Authentication.providers.email.mailer, "DefinedMailer");
  }
}
