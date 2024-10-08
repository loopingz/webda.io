import { suite, test } from "../test/core";
import * as assert from "assert";
import { mkdirSync, unlinkSync } from "fs";
import pkg from "fs-extra";
import * as path from "path";
import { stub } from "sinon";
import { KubernetesConfigurationService, useConfiguration } from "../index";
import { WebdaApplicationTest } from "../test/test";
import { getCommonJS } from "../utils/esm";
const { emptyDirSync, ensureSymlinkSync, outputFileSync } = pkg;
const { __dirname } = getCommonJS(import.meta.url);

class AbstractKubernetesConfigurationServiceTest extends WebdaApplicationTest {
  folder: string = __dirname + "/../../test/kube";
  dataFolder: string;
  content = {
    "webda.json": JSON.stringify(
      {
        services: {
          Authentication: {
            providers: {
              email: {
                text: "Plop1",
                text2: "Plop6"
              }
            }
          }
        }
      },
      undefined,
      2
    )
  };

  getTestConfiguration() {
    return {
      parameters: {
        ignoreBeans: true,
        configurationService: "KubernetesConfigurationService"
      },
      services: {
        Authentication: {
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
        KubernetesConfigurationService: {
          type: "Webda/KubernetesConfigurationService",
          source: "./test/kube",
          default: {
            services: {
              Authentication: {
                providers: {
                  email: {
                    text: "Plop0"
                  }
                }
              }
            }
          }
        }
      }
    };
  }

  async beforeEach(create: boolean = false) {
    mkdirSync(this.folder, { recursive: true });
    emptyDirSync(this.folder);
    // Empty the kube directory
    if (create) {
      this.createConfigMap();
    }
    await super.beforeEach();
  }

  /**
   * Create the configMap in the right folder
   */
  createConfigMap() {
    this.dataFolder = `..${Date.now()}`;
    mkdirSync(path.join(this.folder, this.dataFolder));
    ensureSymlinkSync(path.join(this.folder, this.dataFolder), path.join(this.folder, "..data"));
    Object.keys(this.content).forEach(f => {
      outputFileSync(path.join(this.folder, this.dataFolder, f), this.content[f]);
      ensureSymlinkSync(path.join(this.folder, "..data", f), path.join(this.folder, f));
    });
  }

  /**
   * Update the config map
   */
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
  /**
   * @override
   */
  async beforeEach() {
    // Create a default configmap like it should be on a starting pod
    await super.beforeEach(true);
  }

  @test
  async cov() {
    const serv = new KubernetesConfigurationService("t", {});
    serv.getParameters().source = undefined;
    assert.rejects(() => serv.init(), /Need a source for KubernetesConfigurationService/);
    serv.getParameters().source = "/notexisting";
    assert.rejects(() => serv.init(), /Need a source for KubernetesConfigurationService/);
    const mock = stub(serv, "loadAndStoreConfiguration").resolves();
    await serv.initConfiguration();
    assert.strictEqual(mock.callCount, 1);
  }

  @test
  async updatedConfigMap() {
    assert.strictEqual(useConfiguration().services.Authentication.providers.email.text, "Plop1");
    assert.strictEqual(useConfiguration().services.Authentication.providers.email.text2, "Plop6");
    assert.strictEqual(useConfiguration().services.Authentication.providers.email.mailer, "DefinedMailer");
    await new Promise(resolve => {
      this.getService("KubernetesConfigurationService").on("Configuration.Applied", resolve);
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
    assert.strictEqual(useConfiguration().services.Authentication.providers.email.text, "Plop2");
    assert.strictEqual(useConfiguration().services.Authentication.providers.email.mailer, "DefinedMailer");
    await new Promise(resolve => {
      this.getService("KubernetesConfigurationService").on("Configuration.Applied", resolve);
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
    assert.strictEqual(useConfiguration().services.Authentication.providers.email.text, "Plop3");
    assert.strictEqual(useConfiguration().services.Authentication.providers.email.mailer, "DefinedMailer");
  }
}

@suite
class EmptyKubernetesConfigurationServiceTest extends AbstractKubernetesConfigurationServiceTest {
  @test
  async unmountedConfigMap() {
    assert.strictEqual(useConfiguration().services.Authentication.providers.email.text, "Plop0");
    assert.strictEqual(useConfiguration().services.Authentication.providers.email.mailer, "DefinedMailer");
  }
}
