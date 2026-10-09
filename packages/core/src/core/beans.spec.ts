import { suite, test } from "@webda/test";
import * as assert from "assert";
import { TestApplication, WebdaInternalSimpleTest } from "../test/index.js";
import { UnpackedConfiguration } from "../application/iconfiguration.js";
import { ConfigurationProvider } from "../configurations/configuration.service.js";
import { useDynamicService } from "./hooks.js";
import { Service } from "../services/service.js";
import { ServiceParameters } from "../services/serviceparameters.js";

/** Bean used to check auto-registration */
class TestBean extends Service {
  static createConfiguration = (params: any) => new ServiceParameters().load(params);
  static filterParameters = (params: any) => params;
}

/** Minimal configuration provider */
class TestConfigurationProvider extends Service implements ConfigurationProvider {
  static createConfiguration = (params: any) => new ServiceParameters().load(params);
  static filterParameters = (params: any) => params;
  async getConfiguration(_id: string): Promise<{ [key: string]: any }> {
    return {
      parameters: {
        dynamicGlobal: "fromConfigService"
      },
      services: {
        TestBean: {
          dynamicValue: "beanFromConfigService"
        }
      }
    };
  }
  canTriggerConfiguration(_id: string, _callback: () => void): boolean {
    return true;
  }
}

/** Register TestBean as a bean of the application */
async function addBean(app: TestApplication) {
  app.addModda("WebdaTest/ConfigurationProvider", TestConfigurationProvider);
  // @ts-ignore protected registry
  app.beans["WebdaDemo/TestBean"] = TestBean;
}

@suite
class UnconfiguredBeanWithConfigurationServiceTest extends WebdaInternalSimpleTest {
  async tweakApp(app: TestApplication): Promise<void> {
    await super.tweakApp(app);
    await addBean(app);
  }

  getTestConfiguration(): string | Partial<UnpackedConfiguration> | undefined {
    return {
      application: {
        configurationService: "ConfigurationService"
      },
      parameters: {
        globalValue: "global"
      },
      services: {
        ConfigurationProvider: {
          type: "WebdaTest/ConfigurationProvider"
        },
        ConfigurationService: {
          sources: ["ConfigurationProvider:test"]
        }
      }
    };
  }

  @test
  async beanIsCreatedWithDynamicConfiguration() {
    const bean = useDynamicService<TestBean>("TestBean");
    assert.ok(bean instanceof TestBean);
    const params: any = bean.getParameters();
    assert.strictEqual(params.globalValue, "global");
    assert.strictEqual(params.dynamicGlobal, "fromConfigService");
    assert.strictEqual(params.dynamicValue, "beanFromConfigService");
  }
}

@suite
class ConfiguredBeanTest extends WebdaInternalSimpleTest {
  async tweakApp(app: TestApplication): Promise<void> {
    await super.tweakApp(app);
    await addBean(app);
  }

  getTestConfiguration(): string | Partial<UnpackedConfiguration> | undefined {
    return {
      services: {
        myBean: {
          type: "TestBean",
          customValue: "configured"
        }
      }
    };
  }

  @test
  async beanIsCreatedFromServicesConfiguration() {
    const bean = useDynamicService<TestBean>("myBean");
    assert.ok(bean instanceof TestBean);
    assert.strictEqual((bean.getParameters() as any).customValue, "configured");
    // The bean is already configured: no default instance is added
    assert.strictEqual(this.webda.getServices()["TestBean"], undefined);
  }
}
