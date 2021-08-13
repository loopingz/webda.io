import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import { WebdaTest } from "../test";
import { writeFileSync, readFileSync } from "fs";
import { FileConfigurationService } from "./fileconfiguration";

@suite
class FileConfigurationServiceTest extends WebdaTest {
  getTestConfiguration() {
    return __dirname + "/../../test/config-file-reload.json";
  }

  async before() {
    writeFileSync(
      __dirname + "/../../test/my-cnf.json",
      JSON.stringify(
        {
          webda: {
            services: {
              "Authentication.providers.email.text": "Test"
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
    assert.strictEqual(this.webda.getConfiguration().services.Authentication.providers.email.text, "Test");
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
          await this.webda.getService<FileConfigurationService>("FileConfigurationService")._checkUpdate();
          resolve();
        }
      }, 30000);
      writeFileSync(
        __dirname + "/../../test/my-cnf.json",
        JSON.stringify(
          {
            webda: {
              services: {
                "Authentication.providers.email.text": "Plop"
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
