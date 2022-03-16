import { Application } from "@webda/core";
import * as assert from "assert";
import * as fs from "fs-extra";
import * as fetch from "node-fetch";
import * as path from "path";
import { SourceApplication } from "./code/sourceapplication";

class TestApplication extends SourceApplication {
  clean() {
    fs.removeSync(this.getAppPath("lib"));
    fs.removeSync(this.getAppPath("webda.module.json"));
  }
}

export const WebdaSampleApplication = new TestApplication(path.resolve(`${__dirname}/../../../sample-app/`));

/**
 * Test the sample application
 */
export class SampleApplicationTest {
  baseUrl: string;
  constructor(url: string) {
    this.baseUrl = url;
  }

  async testApi(noCsrf: number = 401) {
    let res = await fetch(`${this.baseUrl}/test`, {});
    assert.strictEqual(res.status, noCsrf);
    // Status 401 as CSRF protection is on
    // Check OPTIONS
    res = await fetch(`${this.baseUrl}/test`, {
      headers: { host: "dev.webda-demo.com" },
      method: "OPTIONS"
    });
    assert.strictEqual(res.status, 200);
    // Check OPTIONS
    res = await fetch(`${this.baseUrl}/test2`, {
      headers: { host: "dev.webda-demo.com" },
      method: "OPTIONS"
    });
    assert.strictEqual(res.status, 404);
    // Test default answer
    res = await fetch(`${this.baseUrl}/test`, {
      headers: { host: "dev.webda-demo.com" }
    });
    assert.strictEqual(await res.text(), "Tested");
    // Message
    res = await fetch(`${this.baseUrl}/msg/bouzouf`, {
      headers: { host: "dev.webda-demo.com" }
    });
    assert.strictEqual(await res.text(), "YOUR MESSAGE IS 'bouzouf'");
    // on purpose change the host and rely on the x-forwarded-*
    res = await fetch(`${this.baseUrl}/test`, {
      headers: {
        host: "dev2.webda-demo.com",
        "x-forwarded-proto": "https",
        "x-forwarded-host": "dev.webda-demo.com",
        origin: "bouzouf"
      }
    });
    assert.strictEqual(res.headers.get("Strict-Transport-Security"), "max-age=31536000; includeSubDomains; preload");
    assert.strictEqual(res.headers.get("Access-Control-Allow-Origin"), "bouzouf");
    assert.strictEqual(await res.text(), "Tested");
    // Create a contact
    // Get a contact
    // Update a contact
    // Patch a contact
    // Delete a contact
  }

  async testStatic() {
    let resp = await fetch(`${this.baseUrl}/version.txt`, {});
    assert.strictEqual(resp.headers.get("content-type"), "text/plain; charset=UTF-8");
    assert.strictEqual(await resp.text(), "FakeTestVersion");
    resp = await fetch(`${this.baseUrl}/index.html`, {});
    assert.strictEqual(resp.headers.get("content-type"), "text/html; charset=UTF-8");
    assert.notStrictEqual((await resp.text()).match(/<title>webda Sample Contact App<\/title>/g), undefined);
    resp = await fetch(`${this.baseUrl}/bouzouf`, {});
    assert.strictEqual(resp.headers.get("content-type"), "text/html; charset=UTF-8");
    assert.notStrictEqual((await resp.text()).match(/<title>webda Sample Contact App<\/title>/g), undefined);
  }
}
