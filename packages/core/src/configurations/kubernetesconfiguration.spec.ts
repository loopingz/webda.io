import { suite, test, timeout } from "@webda/test";
import * as assert from "assert";
import { mkdirSync, unlinkSync, symlinkSync } from "fs";
import pkg from "fs-extra";
import * as path from "path";
import { Authentication, useCoreEvents, useService } from "../index.js";
import { WebdaApplicationTest } from "../test/application.js";
import { getCommonJS } from "@webda/utils";
const { emptyDirSync, outputFileSync } = pkg;
const { __dirname } = getCommonJS(import.meta.url);

class AbstractKubernetesConfigurationServiceTest extends WebdaApplicationTest {
  folder: string = __dirname + "/../../test/kube";
  dataFolder: string;
  content = {
    "webda.json": JSON.stringify(
      {
        services: {
          Authentication: {
            email: {
              text: "Plop1",
              text2: "Plop6"
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
      application: {
        ignoreBeans: true,
        configurationService: "KubernetesConfigurationService"
      },
      services: {
        Authentication: {
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
        Users: {
          type: "MemoryStore"
        },
        Idents: {
          type: "MemoryStore"
        },
        KubernetesConfigurationService: {
          type: "Webda/KubernetesConfigurationService",
          sources: ["./test/kube"]
        }
      }
    };
  }

  async beforeAll(create: boolean = false) {
    mkdirSync(this.folder, { recursive: true });
    emptyDirSync(this.folder);
    // Empty the kube directory
    if (create) {
      this.createConfigMap();
    }
    await super.beforeAll();
  }

  /**
   * Create the configMap in the right folder
   */
  createConfigMap() {
    this.dataFolder = "..configmap-v1";
    mkdirSync(path.join(this.folder, this.dataFolder));
    symlinkSync(this.dataFolder, path.join(this.folder, "..data"));
    Object.keys(this.content).forEach(f => {
      outputFileSync(path.join(this.folder, this.dataFolder, f), this.content[f]);
      symlinkSync(path.join("..data", f), path.join(this.folder, f));
    });
  }

  /**
   * Update the config map
   */
  private updateCount = 0;

  updateConfigMap(content: any) {
    this.updateCount++;
    this.dataFolder = `..configmap-v${this.updateCount + 1}`;
    this.content = content;
    mkdirSync(path.join(this.folder, this.dataFolder), { recursive: true });
    Object.keys(this.content).forEach(f => {
      outputFileSync(path.join(this.folder, this.dataFolder, f), this.content[f]);
    });
    unlinkSync(path.join(this.folder, "..data"));
    symlinkSync(this.dataFolder, path.join(this.folder, "..data"));
  }
}

@suite
class KubernetesConfigurationServiceTest extends AbstractKubernetesConfigurationServiceTest {
  /**
   * @override
   */
  async beforeAll() {
    // Create a default configmap like it should be on a starting pod
    await super.beforeAll(true);
  }

  @test
  @timeout(30000)
  async updatedConfigMap() {
    const auth = useService<Authentication>("Authentication");
    assert.strictEqual(auth.parameters.email!.text, "Plop1");
    assert.strictEqual(auth.parameters.email!.mailer, "DefinedMailer");
    console.log("Update config map", Date.now());
    await new Promise(resolve => {
      useCoreEvents("Webda.Configuration.Applied", resolve, true);
      this.updateConfigMap({
        ...this.content,
        "webda.json": JSON.stringify({
          services: {
            Authentication: {
              email: {
                text: "Plop2"
              }
            }
          }
        })
      });
    });
    assert.strictEqual(auth.parameters.email!.text, "Plop2");
    assert.strictEqual(auth.parameters.email!.mailer, "DefinedMailer");
    console.log("Update config map 2");
    await new Promise(resolve => {
      useCoreEvents("Webda.Configuration.Applied", resolve, true);
      this.updateConfigMap({
        ...this.content,
        "webda.json": JSON.stringify({
          services: {
            Authentication: {
              email: {
                text: "Plop3"
              }
            }
          }
        })
      });
    });
    assert.strictEqual(auth.parameters.email!.text, "Plop3");
    assert.strictEqual(auth.parameters.email!.mailer, "DefinedMailer");
  }
}
