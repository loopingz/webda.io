import { suite, test } from "@webda/test";
import * as assert from "assert";
import { stub } from "sinon";
import { TestApplication, WebdaInternalSimpleTest } from "../test/index.js";
import {
  ConfigurationProvider,
  ConfigurationService,
  ConfigurationServiceParameters
} from "./configuration.service.js";
import { UnpackedConfiguration } from "../application/iconfiguration.js";
import { useDynamicService, useService } from "../core/hooks.js";
import { Service } from "../services/service.js";
import { ServiceParameters } from "../services/serviceparameters.js";
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
        SampleService: {
          type: "WebdaTest/FakeService",
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
              SampleService: {
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
    const auth = useDynamicService<any>("SampleService");
    assert.strictEqual(auth.getParameters().email!.text, "Test");
    assert.strictEqual(auth.getParameters().email!.mailer, "DefinedMailer");
    const test = {
      uuid: "test",
      services: {
        SampleService: {
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
    assert.strictEqual(auth.getParameters().email!.text, "Plop");
    assert.strictEqual(auth.getParameters().email!.mailer, "DefinedMailer");
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

  @test
  async additionalConfigurationCoverage() {
    const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { FileConfigurationService } = await import("./fileconfiguration.service.js");
    const { KubernetesConfigurationParameters, KubernetesConfigurationService } =
      await import("./kubernetesconfiguration.service.js");

    const params = new ConfigurationServiceParameters().load({ sources: ["ConfigurationProvider:a", "selfId"] });
    assert.strictEqual(params.checkIntervalMs, 3600000);
    const service = new ConfigurationService("ConfigurationService", params);
    service.resolve();
    assert.strictEqual(
      service.canTriggerConfiguration("selfId", () => {}),
      false
    );

    // Invalid source service without getConfiguration
    const badParams = new ConfigurationServiceParameters().load({ source: "DefinedMailer:a" });
    const badService = new ConfigurationService("BadConfig", badParams);
    assert.throws(() => badService.resolve(), /is not implementing ConfigurationProvider interface/);

    // Non-dynamic provider sets interval in init(), updates nextCheck in checkUpdate(), and deletes own service entry
    const provider = useService<TestConfigurationProvider>("ConfigurationProvider");
    provider.setConfiguration("a", {
      services: {
        SelfConfig: { type: "Webda/ConfigurationService" },
        SampleService: { email: { text: "FromA" } }
      }
    });
    provider.setConfiguration("b", {
      services: {
        SampleService: { email: { text: "FromB" } }
      }
    });
    const origCanTrigger = provider.canTriggerConfiguration;
    try {
      provider.canTriggerConfiguration = () => false;
      const multiParams = new ConfigurationServiceParameters().load({
        sources: ["ConfigurationProvider:a", "ConfigurationProvider:b"],
        checkInterval: 3600
      });
      const multiService = new ConfigurationService("SelfConfig", multiParams);
      await multiService.bootstrap(this.webda);
      await multiService.init();
      await multiService["checkUpdate"](true);
      await multiService.stop();
    } finally {
      provider.canTriggerConfiguration = origCanTrigger;
    }

    // FileConfigurationService extensionless getFilePath and missing file without default
    const root = mkdtempSync(join(tmpdir(), "webda-cfg-cov-"));
    try {
      const existingJson = join(root, "existing.json");
      writeFileSync(existingJson, JSON.stringify({ services: {}, parameters: { k: 1 } }));
      const fileSvc = new FileConfigurationService(
        "FileCfg",
        new ConfigurationServiceParameters().load({ default: { services: {}, parameters: {} } })
      );
      assert.strictEqual(fileSvc.getFilePath(join(root, "existing")), existingJson);
      assert.strictEqual(fileSvc.getFilePath(join(root, "created")), join(root, "created.yaml"));

      const noDefaultSvc = new FileConfigurationService("FileCfgNoDef", new ConfigurationServiceParameters().load({}));
      noDefaultSvc.getParameters().default = undefined;
      assert.throws(() => noDefaultSvc.getFilePath(join(root, "missing.json")), /Configuration file not found/);

      // KubernetesConfigurationParameters and KubernetesConfigurationService error branches
      assert.throws(
        () => new KubernetesConfigurationParameters().load({ default: { services: { S: {} } } }),
        /does not support default configuration/
      );
      const kubeSvc = new KubernetesConfigurationService("KubeCfg", new KubernetesConfigurationParameters().load({}));
      assert.throws(() => kubeSvc.getFilePath(join(root, "no-kube-dir")), /Kubernetes configuration source not found/);
      kubeSvc.sourcePaths["gone"] = join(root, "no-kube-dir");
      assert.throws(
        () => kubeSvc.canTriggerConfiguration("gone", () => {}),
        /Kubernetes configuration source not found/
      );
      const emptyKubeDir = join(root, "empty-kube");
      mkdirSync(emptyKubeDir, { recursive: true });
      await assert.rejects(() => kubeSvc.getConfiguration(emptyKubeDir), /Kubernetes configuration source not valid/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
}
