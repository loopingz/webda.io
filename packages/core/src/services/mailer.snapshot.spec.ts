import { suite, test } from "@webda/test";
import * as assert from "assert";
import { mkdirSync, writeFileSync } from "fs";
import { UnpackedConfiguration, useService } from "../index.js";
import { WebdaApplicationTest } from "../test/application.js";

const REPLACEMENTS = {
  infos: { token: "tok&<1>'", expire: 1700000000000, login: "o'neil@x.io" },
  url: "https://x.io/a?b=1&c=2",
  name: "Zoë & <Co>"
};

const SNAPSHOT_DIR = "test/mailer-snapshots";

/**
 * Freezes the output of the current Mailer for the bundled templates
 * (temporary: removed once the new renderer has been proven identical)
 */
@suite
class MailerSnapshotTest extends WebdaApplicationTest {
  mailer;
  lastOptions;

  getTestConfiguration(): string | Partial<UnpackedConfiguration> | undefined {
    return {
      parameters: {
        ignoreBeans: true
      },
      services: {
        TrueMailer: {
          type: "Webda/Mailer",
          config: {
            transport: "ses"
          }
        }
      }
    };
  }

  async beforeEach() {
    await super.beforeEach();
    this.lastOptions = undefined;
    this.mailer = useService("TrueMailer");
    this.mailer._transporter = {
      sendMail: options => {
        this.lastOptions = options;
        return Promise.resolve();
      }
    };
  }

  /**
   * Render a template and write subject/html/text to the snapshot folder
   * @param template name of the template
   */
  async snapshot(template: string) {
    await this.mailer.send({ template, to: "a@b.c", replacements: REPLACEMENTS });
    const { subject, html, text } = this.lastOptions;
    assert.ok(subject && html && text);
    mkdirSync(SNAPSHOT_DIR, { recursive: true });
    writeFileSync(`${SNAPSHOT_DIR}/${template}.json`, JSON.stringify({ subject, html, text }, null, 2) + "\n");
  }

  @test
  async recovery() {
    await this.snapshot("PASSPORT_EMAIL_RECOVERY");
  }

  @test
  async register() {
    await this.snapshot("PASSPORT_EMAIL_REGISTER");
  }
}
