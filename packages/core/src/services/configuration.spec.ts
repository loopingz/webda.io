import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import { stub } from "sinon";
import { CoreModel } from "../models/coremodel";
import { Store } from "../stores/store";
import { WebdaInternalSimpleTest } from "../test";
import { getCommonJS } from "../utils/esm";
import { ConfigurationService } from "./configuration";
const { __filename, __dirname } = getCommonJS(import.meta.url);

@suite
class ConfigurationServiceTest extends WebdaInternalSimpleTest {
  getTestConfiguration() {
    return {
      parameters: {
        ignoreBeans: true
      },
      services: {
        Authentication: {
          successRedirect: "https://webda.io/user.html",
          failureRedirect: "/login-error",
          providers: {
            facebook: {},
            email: {
              from: "",
              subject: "",
              html: "",
              text: "Test",
              mailer: "DefinedMailer",
              postValidation: false
            },
            phone: {},
            twitter: {},
            google: {},
            github: {}
          }
        },
        DefinedMailer: {
          type: "WebdaTest/Mailer"
        },
        Users: {
          type: "MemoryStore"
        },
        Idents: {
          type: "MemoryStore"
        },
        ConfigurationStore: {
          type: "MemoryStore"
        },
        ConfigurationService: {
          source: "ConfigurationStore:test",
          checkInterval: 2,
          default: {
            services: {
              Authentication: {
                providers: {
                  email: {
                    text: "Test"
                  }
                }
              }
            }
          }
        }
      }
    };
  }

  @test
  async init() {
    const service = new ConfigurationService(this.webda, "name", {});
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
    await assert.rejects(() => service.initConfiguration(), /ConfigurationService with dependencies cannot be used/);
  }

  @test
  async initialLoad() {
    assert.strictEqual(this.webda.getConfiguration().services.Authentication.providers.email.text, "Test");
    assert.strictEqual(this.webda.getConfiguration().services.Authentication.providers.email.mailer, "DefinedMailer");
    const test = {
      uuid: "test",
      services: {
        Authentication: {
          providers: {
            email: {
              text: "Plop"
            }
          }
        }
      }
    };
    const store: Store<CoreModel> = <Store<CoreModel>>this.webda.getService("ConfigurationStore");
    await new Promise(async resolve => {
      this.webda.getService("ConfigurationService").on("Configuration.Applied", resolve);
      await store.save(test);
    });
    assert.strictEqual(this.webda.getConfiguration().services.Authentication.providers.email.text, "Plop");
    assert.strictEqual(this.webda.getConfiguration().services.Authentication.providers.email.mailer, "DefinedMailer");
    const service = this.webda.getService<ConfigurationService>("ConfigurationService");
    // @ts-ignore
    await service.checkUpdate();
    // @ts-ignore
    const mock = stub(service, "loadConfiguration").callsFake(() => {});
    // @ts-ignore
    service.nextCheck = Date.now() + 86400000;
    // @ts-ignore
    service.interval = 1;
    // @ts-ignore
    await service.checkUpdate();
    assert.strictEqual(mock.callCount, 0);
  }
}
