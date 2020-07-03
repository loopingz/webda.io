import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import { WebdaTest } from "../test";
import { writeFileSync, readFileSync } from "fs";

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
    assert.equal(this.webda.getConfiguration().services.Authentication.providers.email.text, "Test");
    assert.equal(this.webda.getConfiguration().services.Authentication.providers.email.mailer, "DefinedMailer");
    await new Promise(resolve => {
      this.webda.getService("FileConfigurationService").on("Configuration.Applied", resolve);
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

    assert.equal(this.webda.getConfiguration().services.Authentication.providers.email.text, "Plop");
    assert.equal(this.webda.getConfiguration().services.Authentication.providers.email.mailer, "DefinedMailer");
  }
}
