import { suite, test } from "@webda/test";
import * as assert from "assert";
import { existsSync, unlinkSync, writeFileSync } from "fs";
import { WebdaApplicationTest } from "../test/application";
import { getCommonJS } from "@webda/utils";
import { FileConfigurationService } from "./fileconfiguration";
import { useService } from "../core/hooks";
import { Authentication } from "../services/authentication";
import { useCoreEvents } from "../events/events";
const { __dirname } = getCommonJS(import.meta.url);

class FileConfigurationAbstractTest extends WebdaApplicationTest {
  getTestConfiguration() {
    return {
      application: {
        ignoreBeans: true,
        configurationService: "FileConfigurationService"
      },
      services: {
        TestStore: {
          type: "MemoryStore"
        },
        Authentication: {
          email: {
            text: "Test",
            mailer: "DefinedMailer"
          }
        },
        DefinedMailer: {
          type: "WebdaTest/Mailer"
        },
        FileConfigurationService: {
          type: "Webda/FileConfiguration",
          source: "./test/my-cnf.json",
          default: {
            services: {
              Authentication: {
                email: {
                  text: "DefaultTest"
                }
              }
            }
          }
        }
      }
    };
  }
}

@suite
class FileConfigurationServiceTest extends FileConfigurationAbstractTest {
  async beforeAll() {
    this.cleanFiles.push(__dirname + "/../../test/my-cnf.json");
    writeFileSync(
      __dirname + "/../../test/my-cnf.json",
      JSON.stringify(
        {
          services: {
            Authentication: {
              email: {
                text: "ConfigTest"
              }
            },
            ImplicitBean: {
              implicit: "ok"
            }
          }
        },
        undefined,
        2
      )
    );
    await super.beforeAll();
  }

  @test
  async initialLoad() {
    const auth = useService<Authentication>("Authentication");
    assert.strictEqual(auth.parameters.email!.text, "ConfigTest");
    assert.strictEqual(auth.parameters.email!.mailer, "DefinedMailer");
    await new Promise<void>(resolve => {
      let ok = false;
      useCoreEvents(
        "Webda.Configuration.Applied",
        () => {
          ok = true;
          resolve();
        },
        true
      );
      // Github fs watcher seems to have some issue
      setTimeout(async () => {
        if (!ok) {
          console.log("WARN: Bypass the fs.watch");
          await this.getService<FileConfigurationService>("FileConfigurationService")
            // @ts-ignore
            .checkUpdate();
          resolve();
        }
      }, 30000);
      writeFileSync(
        __dirname + "/../../test/my-cnf.json",
        JSON.stringify(
          {
            services: {
              Authentication: {
                email: {
                  text: "Plop"
                }
              }
            }
          },
          undefined,
          2
        )
      );
    });

    assert.strictEqual(auth.parameters.email!.text, "Plop");
    assert.strictEqual(auth.parameters.email!.mailer, "DefinedMailer");
  }
}

@suite
class FileConfigurationNoReloadServiceTest extends FileConfigurationAbstractTest {
  async beforeAll() {
    writeFileSync(
      __dirname + "/../../test/my-cnf.json",
      JSON.stringify(
        {
          services: {
            Authentication: {
              email: {
                text: "Test2"
              }
            }
          }
        },
        undefined,
        2
      )
    );
    await super.beforeAll();
  }

  @test
  async initialLoad() {
    const auth = useService<Authentication>("Authentication");
    assert.strictEqual(auth.parameters.email?.text, "Test2");
    assert.strictEqual(auth.parameters.email?.mailer, "DefinedMailer");
  }
}

@suite
class FileConfigurationNoReloadMissingServiceTest extends FileConfigurationAbstractTest {
  getTestConfiguration() {
    const cfg: any = super.getTestConfiguration();
    cfg.services.FileConfigurationService.default.services.Authentication.email.text = "Test";
    return cfg;
  }

  async beforeAll() {
    const filename = __dirname + "/../../test/my-cnf.json";
    if (existsSync(filename)) {
      unlinkSync(filename);
    }
    await super.beforeAll();
  }

  @test
  async initialLoad() {
    const auth = useService<Authentication>("Authentication");
    assert.strictEqual(auth.parameters.email?.text, "Test");
    assert.strictEqual(auth.parameters.email?.mailer, "DefinedMailer");
  }
}

@suite
class FileConfigurationMissingFileNoDefaultTest extends FileConfigurationAbstractTest {
  getTestConfiguration() {
    const cfg: any = super.getTestConfiguration();
    cfg.services.FileConfigurationService.default = undefined;
    cfg.services.FileConfigurationService.source = "./test/my-missing-file.json";
    return cfg;
  }

  async beforeEach() {
    const filename = __dirname + "/../../test/my-missing-file.json";
    if (existsSync(filename)) {
      unlinkSync(filename);
    }
    await super.beforeEach();
  }

  @test
  async initialLoad() {
    const auth = useService<Authentication>("Authentication");
    //
    assert.strictEqual(auth.parameters.email?.text, "Test");
  }
}

@suite
class FileConfigurationMissingFileTest extends FileConfigurationAbstractTest {
  getTestConfiguration() {
    const cfg: any = super.getTestConfiguration();
    cfg.services.FileConfigurationService.source = "./test/my-missing-file.json";
    return cfg;
  }

  async beforeAll(init?: boolean): Promise<void> {
    await super.beforeAll(init);
    // throw new Error("STOP");
  }

  async beforeEach() {
    const filename = __dirname + "/../../test/my-missing-file.json";
    if (existsSync(filename)) {
      unlinkSync(filename);
    }
    await super.beforeEach();
  }

  @test
  async initialLoad() {
    const auth = useService<Authentication>("Authentication");
    assert.strictEqual(auth.parameters.email?.text, "DefaultTest");
  }
}
