import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import { WebdaTest } from "../test";
import { outputFileSync, emptyDirSync, ensureSymlinkSync } from "fs-extra";
import * as path from "path";
import * as yaml from "yaml";
import { mkdirSync, unlinkSync } from "fs";

class AbstractKubernetesConfigurationServiceTest extends WebdaTest {
  folder: string = __dirname + "/../../test/kube";
  dataFolder: string;
  content = {
    "webda.json": JSON.stringify(
      {
        services: {
          "Authentication.providers.email.text": "Plop0"
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
  async updatedConfigMap() {
    assert.equal(this.webda.getConfiguration().services.Authentication.providers.email.text, "Plop0");
    assert.equal(this.webda.getConfiguration().services.Authentication.providers.email.mailer, "DefinedMailer");
    await new Promise(resolve => {
      this.webda.getService("KubernetesConfigurationService").on("Configuration.Applied", resolve);
      this.updateConfigMap({
        ...this.content,
        "webda.json": JSON.stringify({
          services: {
            "Authentication.providers.email.text": "Plop"
          }
        })
      });
    });
    assert.equal(this.webda.getConfiguration().services.Authentication.providers.email.text, "Plop");
    assert.equal(this.webda.getConfiguration().services.Authentication.providers.email.mailer, "DefinedMailer");
    await new Promise(resolve => {
      this.webda.getService("KubernetesConfigurationService").on("Configuration.Applied", resolve);
      this.updateConfigMap({
        ...this.content,
        "webda.json": JSON.stringify({
          services: {
            "Authentication.providers.email.text": "Plop2"
          }
        })
      });
    });
    assert.equal(this.webda.getConfiguration().services.Authentication.providers.email.text, "Plop2");
    assert.equal(this.webda.getConfiguration().services.Authentication.providers.email.mailer, "DefinedMailer");
  }
}

@suite
class EmptyKubernetesConfigurationServiceTest extends AbstractKubernetesConfigurationServiceTest {
  @test
  async unmountedConfigMap() {
    assert.equal(this.webda.getConfiguration().services.Authentication.providers.email.text, "Test");
    assert.equal(this.webda.getConfiguration().services.Authentication.providers.email.mailer, "DefinedMailer");
  }
}
