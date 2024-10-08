import { suite, test } from "../test/core";
import * as assert from "assert";
import { existsSync, unlinkSync, writeFileSync } from "fs";
import { WebdaApplicationTest } from "../test/test";
import { getCommonJS } from "../utils/esm";
import { FileConfigurationService } from "./fileconfiguration";
import { useConfiguration } from "../core/instancestorage";
const { __dirname } = getCommonJS(import.meta.url);

class FileConfigurationAbstractTest extends WebdaApplicationTest {
  getTestConfiguration() {
    return {
      parameters: {
        ignoreBeans: true,
        configurationService: "FileConfigurationService"
      },
      services: {
        TestStore: {
          type: "MemoryStore"
        },
        Authentication: {
          providers: {
            email: {
              text: "Test",
              mailer: "DefinedMailer"
            }
          }
        },
        FileConfigurationService: {
          type: "Webda/FileConfiguration",
          source: "./test/my-cnf.json",
          default: {
            services: {
              Authentication: {
                providers: {
                  email: {
                    text: "DefaultTest"
                  }
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
  async beforeEach() {
    this.cleanFiles.push(__dirname + "/../../test/my-cnf.json");
    writeFileSync(
      __dirname + "/../../test/my-cnf.json",
      JSON.stringify(
        {
          services: {
            Authentication: {
              providers: {
                email: {
                  text: "ConfigTest"
                }
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
    await super.beforeEach();
  }

  @test
  async initialLoad() {
    // Check exceptions
    await assert.rejects(
      () => new FileConfigurationService("except", {}).init(),
      /Need a source for FileConfigurationService/
    );
    await assert.rejects(
      () =>
        new FileConfigurationService("except", {
          source: "/plops"
        }).init(),
      /Need a source for FileConfigurationService/
    );

    assert.strictEqual(useConfiguration().services.Authentication.providers.email.text, "ConfigTest");
    assert.strictEqual(useConfiguration().services.Authentication.providers.email.mailer, "DefinedMailer");
    await new Promise<void>(resolve => {
      let ok = false;
      this.getService("FileConfigurationService").on("Configuration.Applied", () => {
        ok = true;
        resolve();
      });
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
                providers: {
                  email: {
                    text: "Plop"
                  }
                }
              }
            }
          },
          undefined,
          2
        )
      );
    });

    assert.strictEqual(useConfiguration().services.Authentication.providers.email.text, "Plop");
    assert.strictEqual(useConfiguration().services.Authentication.providers.email.mailer, "DefinedMailer");
  }
}

@suite
class FileConfigurationNoReloadServiceTest extends FileConfigurationAbstractTest {
  async beforeEach() {
    writeFileSync(
      __dirname + "/../../test/my-cnf.json",
      JSON.stringify(
        {
          services: {
            Authentication: {
              providers: {
                email: {
                  text: "Test2"
                }
              }
            }
          }
        },
        undefined,
        2
      )
    );
    await super.beforeEach();
  }

  @test
  async initialLoad() {
    assert.strictEqual(useConfiguration().services.Authentication.providers.email.text, "Test2");
    assert.strictEqual(useConfiguration().services.Authentication.providers.email.mailer, "DefinedMailer");
  }
}

@suite
class FileConfigurationNoReloadMissingServiceTest extends FileConfigurationAbstractTest {
  getTestConfiguration() {
    const cfg: any = super.getTestConfiguration();
    cfg.services.FileConfigurationService.default.services.Authentication.providers.email.text = "Test";
    return cfg;
  }

  async beforeEach() {
    const filename = __dirname + "/../../test/my-cnf.json";
    if (existsSync(filename)) {
      unlinkSync(filename);
    }
    await super.beforeEach();
  }

  @test
  async initialLoad() {
    assert.strictEqual(useConfiguration().services.Authentication.providers.email.text, "Test");
    assert.strictEqual(useConfiguration().services.Authentication.providers.email.mailer, "DefinedMailer");
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
    assert.strictEqual(useConfiguration().services.Authentication.providers.email.text, "Test");
  }
}

@suite
class FileConfigurationMissingFileTest extends FileConfigurationAbstractTest {
  getTestConfiguration() {
    const cfg: any = super.getTestConfiguration();
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
    assert.strictEqual(useConfiguration().services.Authentication.providers.email.text, "DefaultTest");
  }
}
