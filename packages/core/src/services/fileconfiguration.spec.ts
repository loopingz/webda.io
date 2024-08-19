import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import { existsSync, unlinkSync, writeFileSync } from "fs";
import { WebdaInternalTest } from "../test";
import { getCommonJS } from "../utils/esm";
import { FileConfigurationService } from "./fileconfiguration";
const { __dirname } = getCommonJS(import.meta.url);

class FileConfigurationAbstractTest extends WebdaInternalTest {
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
  async before() {
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
    await super.before();
  }

  @test
  async initialLoad() {
    // Check exceptions
    await assert.rejects(
      () => new FileConfigurationService(this.webda, "except", {}).init(),
      /Need a source for FileConfigurationService/
    );
    await assert.rejects(
      () =>
        new FileConfigurationService(this.webda, "except", {
          source: "/plops"
        }).init(),
      /Need a source for FileConfigurationService/
    );

    assert.strictEqual(this.webda.getConfiguration().services.Authentication.providers.email.text, "ConfigTest");
    assert.strictEqual(this.webda.getConfiguration().services.Authentication.providers.email.mailer, "DefinedMailer");
    await new Promise<void>(resolve => {
      let ok = false;
      this.webda.getService("FileConfigurationService").on("Configuration.Applied", () => {
        ok = true;
        resolve();
      });
      // Github fs watcher seems to have some issue
      setTimeout(async () => {
        if (!ok) {
          console.log("WARN: Bypass the fs.watch");
          await this.webda
            .getService<FileConfigurationService>("FileConfigurationService")
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

    assert.strictEqual(this.webda.getConfiguration().services.Authentication.providers.email.text, "Plop");
    assert.strictEqual(this.webda.getConfiguration().services.Authentication.providers.email.mailer, "DefinedMailer");
  }
}

@suite
class FileConfigurationNoReloadServiceTest extends FileConfigurationAbstractTest {
  async before() {
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
    await super.before();
  }

  @test
  async initialLoad() {
    assert.strictEqual(this.webda.getConfiguration().services.Authentication.providers.email.text, "Test2");
    assert.strictEqual(this.webda.getConfiguration().services.Authentication.providers.email.mailer, "DefinedMailer");
  }
}

@suite
class FileConfigurationNoReloadMissingServiceTest extends FileConfigurationAbstractTest {
  getTestConfiguration() {
    let cfg: any = super.getTestConfiguration();
    cfg.services.FileConfigurationService.default.services.Authentication.providers.email.text = "Test";
    return cfg;
  }

  async before() {
    const filename = __dirname + "/../../test/my-cnf.json";
    if (existsSync(filename)) {
      unlinkSync(filename);
    }
    await super.before();
  }

  @test
  async initialLoad() {
    assert.strictEqual(this.webda.getConfiguration().services.Authentication.providers.email.text, "Test");
    assert.strictEqual(this.webda.getConfiguration().services.Authentication.providers.email.mailer, "DefinedMailer");
  }
}

@suite
class FileConfigurationMissingFileNoDefaultTest extends FileConfigurationAbstractTest {
  getTestConfiguration() {
    let cfg: any = super.getTestConfiguration();
    cfg.services.FileConfigurationService.default = undefined;
    cfg.services.FileConfigurationService.source = "./test/my-missing-file.json";
    return cfg;
  }

  async before() {
    const filename = __dirname + "/../../test/my-missing-file.json";
    if (existsSync(filename)) {
      unlinkSync(filename);
    }
    await super.before();
  }

  @test
  async initialLoad() {
    assert.strictEqual(this.webda.getConfiguration().services.Authentication.providers.email.text, "Test");
  }
}

@suite
class FileConfigurationMissingFileTest extends FileConfigurationAbstractTest {
  getTestConfiguration() {
    let cfg: any = super.getTestConfiguration();
    cfg.services.FileConfigurationService.source = "./test/my-missing-file.json";
    return cfg;
  }

  async before() {
    const filename = __dirname + "/../../test/my-missing-file.json";
    if (existsSync(filename)) {
      unlinkSync(filename);
    }
    await super.before();
  }

  @test
  async initialLoad() {
    assert.strictEqual(this.webda.getConfiguration().services.Authentication.providers.email.text, "DefaultTest");
  }
}
