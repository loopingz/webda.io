import { suite, test } from "@webda/test";
import * as assert from "assert";
import { stub } from "sinon";
import { TestApplication, WebdaInternalSimpleTest } from "../test/index.js";
import { ConfigurationProvider, ConfigurationService, ConfigurationServiceParameters } from "./configuration.js";
import { UnpackedConfiguration } from "../internal/iapplication.js";
import { useService } from "../core/hooks.js";
import { Service } from "../services/service.js";
import { ServiceParameters } from "../services/serviceparameters.js";
import { Authentication } from "../services/authentication.js";
import { useCoreEvents } from "../events/events.js";

class TestConfigurationProvider extends Service implements ConfigurationProvider {
  static createConfiguration = () => new ServiceParameters();
  static filterParameters = (params: any) => params;
  async getConfiguration(id: string): Promise<{ [key: string]: any }> {
    return this.configurations[id] || this.defaults[id] || {};
  }
  canTriggerConfiguration(id: string, callback: () => void, defaultValue?: any): boolean {
    this.callbacks[id] = callback;
    this.defaults[id] = defaultValue;
    return true;
  }
  setConfiguration(id: string, cfg: any) {
    this.configurations[id] = cfg;
    this.callbacks[id]?.();
  }
  configurations: Record<string, any> = {};
  callbacks: Record<string, () => void> = {};
  defaults: Record<string, any> = {};
}

@suite
class TestConfigurationService extends WebdaInternalSimpleTest {
  async tweakApp(app: TestApplication): Promise<void> {
    await super.tweakApp(app);
    app.addModda("WebdaTest/ConfigurationProvider", TestConfigurationProvider);
  }

  getTestConfiguration(): string | Partial<UnpackedConfiguration> | undefined {
    return {
      application: {
        ignoreBeans: true,
        configurationService: "ConfigurationService"
      },
      services: {
        Authentication: {
          successRedirect: "https://webda.io/user.html",
          failureRedirect: "/login-error",
          email: {
            from: "",
            subject: "",
            html: "",
            text: "Test",
            mailer: "DefinedMailer",
            postValidation: false
          }
        },
        DefinedMailer: {
          type: "WebdaTest/Mailer"
        },
        ConfigurationProvider: {
          type: "WebdaTest/ConfigurationProvider"
        },
        ConfigurationService: {
          source: "ConfigurationProvider:test",
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
  async getConfiguration() {
    const service = new ConfigurationService("name", new ConfigurationServiceParameters().load({}));
    await assert.rejects(
      () => service.getConfiguration("id"),
      /ConfigurationService cannot be used as ConfigurationProvider/
    );
  }

  @test
  async initialLoad() {
    const auth = useService<Authentication>("Authentication");
    assert.strictEqual(auth.parameters.email!.text, "Test");
    assert.strictEqual(auth.parameters.email!.mailer, "DefinedMailer");
    const test = {
      uuid: "test",
      services: {
        Authentication: {
          email: {
            text: "Plop"
          }
        }
      }
    };
    const configurationProvider = useService<TestConfigurationProvider>("ConfigurationProvider");
    await new Promise(async resolve => {
      useCoreEvents("Webda.Configuration.Applied", resolve, true);
      configurationProvider.setConfiguration("test", test);
    });
    assert.strictEqual(auth.parameters.email!.text, "Plop");
    assert.strictEqual(auth.parameters.email!.mailer, "DefinedMailer");
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
