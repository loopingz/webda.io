import { Application } from "@webda/core";
import * as assert from "assert";
import * as fetch from "node-fetch";
import * as path from "path";

export const WebdaSampleApplication = new Application(
  path.resolve(`${__dirname}/../../sample-app/`)
);

/**
 * Test the sample application
 */
export class SampleApplicationTest {
  baseUrl: string;
  constructor(url: string) {
    this.baseUrl = url;
  }

  async testApi() {
    let res = await fetch(`${this.baseUrl}/test`, {});

    assert.equal(res.status, 401);
    // Status 401 as CSRF protection is on
    // Check OPTIONS
    res = await fetch(`${this.baseUrl}/test`, {
      headers: { host: "dev.webda-demo.com" },
      method: "OPTIONS"
    });
    assert.equal(res.status, 200);
    // Check OPTIONS
    res = await fetch(`${this.baseUrl}/test2`, {
      headers: { host: "dev.webda-demo.com" },
      method: "OPTIONS"
    });
    assert.equal(res.status, 404);
    // Test default answer
    res = await fetch(`${this.baseUrl}/test`, {
      headers: { host: "dev.webda-demo.com" }
    });
    assert.equal(await res.text(), "Tested");
    // on purpose change the host and rely on the x-forwarded-*
    res = await fetch(`${this.baseUrl}/test`, {
      headers: {
        host: "dev2.webda-demo.com",
        "x-forwarded-proto": "https",
        "x-forwarded-host": "dev.webda-demo.com",
        origin: "bouzouf"
      }
    });
    assert.equal(
      res.headers.get("Strict-Transport-Security"),
      "max-age=31536000; includeSubDomains; preload"
    );
    assert.equal(res.headers.get("Access-Control-Allow-Origin"), "bouzouf");
    assert.equal(await res.text(), "Tested");
    // Create a contact
    // Get a contact
    // Update a contact
    // Patch a contact
    // Delete a contact
  }

  async testStatic() {
    let resp = await fetch(`${this.baseUrl}/version.txt`, {});
    assert.equal(resp.headers.get("content-type"), "text/plain; charset=UTF-8");
    assert.equal(await resp.text(), "FakeTestVersion");
    resp = await fetch(`${this.baseUrl}/index.html`, {});
    assert.equal(resp.headers.get("content-type"), "text/html; charset=UTF-8");
    assert.notEqual(
      (await resp.text()).match(/<title>webda Sample Contact App<\/title>/g),
      undefined
    );
    resp = await fetch(`${this.baseUrl}/bouzouf`, {});
    assert.equal(resp.headers.get("content-type"), "text/html; charset=UTF-8");
    assert.notEqual(
      (await resp.text()).match(/<title>webda Sample Contact App<\/title>/g),
      undefined
    );
  }
}
