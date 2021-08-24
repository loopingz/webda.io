import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import { CoreModel } from "../models/coremodel";
import { Store } from "../stores/store";
import { WebdaTest } from "../test";
import { ConfigurationService, ConfigurationServiceParameters } from "./configuration";

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
  async init() {
    let service = new ConfigurationService(this.webda, "name", {});
    assert.deepStrictEqual(service.getConfiguration(), {});
    // @ts-ignore
    service.configuration = { test: "plop" };
    assert.deepStrictEqual(service.getConfiguration(), { test: "plop" });
    await assert.rejects(() => service.init(), /Need a source for ConfigurationService/);
    service.getParameters().source = "none:plopId";
    await assert.rejects(() => service.init(), /Need a valid service for source/);
    service.getParameters().source = "DefinedMailer";
    await assert.rejects(() => service.init(), /Need a valid source/);
    service.getParameters().source = "DefinedMailer:none";
    await assert.rejects(
      () => service.init(),
      /Service 'DefinedMailer' is not implementing ConfigurationProvider interface/
    );
  }

  @test
  async initialLoad() {
    assert.strictEqual(this.webda.getConfiguration().services.Authentication.providers.email.text, "Test");
    assert.strictEqual(this.webda.getConfiguration().services.Authentication.providers.email.mailer, "DefinedMailer");
    let test = {
      uuid: "test",
      webda: {
        services: {
          "Authentication.providers.email.text": "Plop"
        }
      }
    };
    let store: Store<CoreModel> = <Store<CoreModel>>this.webda.getService("ConfigurationStore");
    await new Promise(async resolve => {
      this.webda.getService("ConfigurationService").on("Configuration.Applied", resolve);
      await store.save(test);
    });
    assert.strictEqual(this.webda.getConfiguration().services.Authentication.providers.email.text, "Plop");
    assert.strictEqual(this.webda.getConfiguration().services.Authentication.providers.email.mailer, "DefinedMailer");
    // @ts-ignore
    await this.webda.getService<ConfigurationService>("ConfigurationService").checkUpdate();
  }
}
