import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import { mkdirSync, unlinkSync } from "fs";
import pkg from "fs-extra";
import * as path from "path";
import { stub } from "sinon";
import * as yaml from "yaml";
import { KubernetesConfigurationService } from "..";
import { WebdaTest } from "../test";
import { getCommonJS } from "../utils/esm";
const { emptyDirSync, ensureSymlinkSync, outputFileSync } = pkg;
const { __dirname } = getCommonJS(import.meta.url);

class AbstractKubernetesConfigurationServiceTest extends WebdaTest {
  folder: string = __dirname + "/../../test/kube";
  dataFolder: string;
  content = {
    "webda.json": JSON.stringify(
      {
        services: {
          Authentication: {
            providers: {
              email: {
                text: "Plop1"
              }
            }
          },
          "Authentication.providers.email.text2": "Plop6"
        }
      },
      undefined,
      2
    ),
    other: "test",
    "yaml.yml": yaml.stringify({
      field: "test"
    })
  };

  getTestConfiguration() {
    return __dirname + "/../../test/config-kube-reload.json";
  }

  async before(create: boolean = false) {
    emptyDirSync(this.folder);
    // Empty the kube directory
    if (create) {
      this.createConfigMap();
    }
    await super.before();
  }

  createConfigMap() {
    this.dataFolder = `..${Date.now()}`;
    mkdirSync(path.join(this.folder, this.dataFolder));
    ensureSymlinkSync(path.join(this.folder, this.dataFolder), path.join(this.folder, "..data"));
    Object.keys(this.content).forEach(f => {
      outputFileSync(path.join(this.folder, this.dataFolder, f), this.content[f]);
      ensureSymlinkSync(path.join(this.folder, "..data", f), path.join(this.folder, f));
    });
  }

  updateConfigMap(content: any) {
    this.dataFolder = `..${Date.now()}`;
    this.content = content;
    mkdirSync(path.join(this.folder, this.dataFolder));
    Object.keys(this.content).forEach(f => {
      outputFileSync(path.join(this.folder, this.dataFolder, f), this.content[f]);
    });
    unlinkSync(path.join(this.folder, "..data"));
    ensureSymlinkSync(path.join(this.folder, this.dataFolder), path.join(this.folder, "..data"));
  }
}

@suite
class KubernetesConfigurationServiceTest extends AbstractKubernetesConfigurationServiceTest {
  async before() {
    await super.before(true);
  }

  @test
  async cov() {
    let serv = new KubernetesConfigurationService(this.webda, "t", {});
    serv.getParameters().source = undefined;
    assert.rejects(() => serv.init(), /Need a source for KubernetesConfigurationService/);
    serv.getParameters().source = "/notexisting";
    assert.rejects(() => serv.init(), /Need a source for KubernetesConfigurationService/);
    let mock = stub(serv, "loadAndStoreConfiguration").resolves();
    await serv.initConfiguration();
    assert.strictEqual(mock.callCount, 1);
  }

  @test
  async updatedConfigMap() {
    assert.strictEqual(this.webda.getConfiguration().services.Authentication.providers.email.text, "Plop1");
    assert.strictEqual(this.webda.getConfiguration().services.Authentication.providers.email.text2, "Plop6");
    assert.strictEqual(this.webda.getConfiguration().services.Authentication.providers.email.mailer, "DefinedMailer");
    await new Promise(resolve => {
      this.webda.getService("KubernetesConfigurationService").on("Configuration.Applied", resolve);
      this.updateConfigMap({
        ...this.content,
        "webda.json": JSON.stringify({
          services: {
            Authentication: {
              providers: {
                email: {
                  text: "Plop2"
                }
              }
            }
          }
        })
      });
    });
    assert.strictEqual(this.webda.getConfiguration().services.Authentication.providers.email.text, "Plop2");
    assert.strictEqual(this.webda.getConfiguration().services.Authentication.providers.email.mailer, "DefinedMailer");
    await new Promise(resolve => {
      this.webda.getService("KubernetesConfigurationService").on("Configuration.Applied", resolve);
      this.updateConfigMap({
        ...this.content,
        "webda.json": JSON.stringify({
          services: {
            Authentication: {
              providers: {
                email: {
                  text: "Plop3"
                }
              }
            }
          }
        })
      });
    });
    assert.strictEqual(this.webda.getConfiguration().services.Authentication.providers.email.text, "Plop3");
    assert.strictEqual(this.webda.getConfiguration().services.Authentication.providers.email.mailer, "DefinedMailer");
  }
}

@suite
class EmptyKubernetesConfigurationServiceTest extends AbstractKubernetesConfigurationServiceTest {
  @test
  async unmountedConfigMap() {
    assert.strictEqual(this.webda.getConfiguration().services.Authentication.providers.email.text, "Plop0");
    assert.strictEqual(this.webda.getConfiguration().services.Authentication.providers.email.mailer, "DefinedMailer");
  }
}
