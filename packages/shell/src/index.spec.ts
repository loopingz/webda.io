import { CachedModule, FileUtils, getCommonJS, Modda, SectionEnum } from "@webda/core";
import * as assert from "assert";
import fetch from "node-fetch";
import * as path from "path";
import { SourceApplication } from "./code/sourceapplication";
const { __dirname } = getCommonJS(import.meta.url);
export class SourceTestApplication extends SourceApplication {
  /**
   * Only allow local and core module and sample-app
   */
  filterModule(filename: string): boolean {
    const relativePath = path.relative(process.cwd(), filename);
    return (
      (!relativePath.includes("..") ||
        relativePath.startsWith("../core") ||
        relativePath.startsWith("../aws") ||
        relativePath.startsWith("../../sample-app/")) &&
      relativePath.indexOf("fake") === -1
    );
  }

  /**
   * Load a webda.module.json file
   * Resolve the linked file to current application
   *
   * @param moduleFile to load
   * @returns
   */
  loadWebdaModule(moduleFile: string): CachedModule {
    // Test are using ts-node so local source should be loaded from .ts with ts-node aswell
    if (process.cwd() === path.dirname(moduleFile)) {
      let module = FileUtils.load(moduleFile);
      Object.keys(SectionEnum)
        .filter(k => Number.isNaN(+k))
        .forEach(p => {
          for (let key in module[SectionEnum[p]]) {
            module[SectionEnum[p]][key] = path.join(
              path.relative(this.getAppPath(), path.dirname(moduleFile)),
              module[SectionEnum[p]][key].replace(/^lib\//, "src/")
            );
          }
        });
      return module;
    }
    return super.loadWebdaModule(moduleFile);
  }

  /**
   * Add our test services
   * @returns
   */
  async load() {
    await super.load();

    this.addService("webdatest/voidstore", <Modda>(<unknown>await import("../../core/test/moddas/voidstore")));
    this.addService("webdatest/fakeservice", <Modda>(<unknown>await import("../../core/test/moddas/fakeservice")));
    this.addService("webdatest/mailer", <Modda>(<unknown>await import("../../core/test/moddas/debugmailer")));
    this.addModel("webdatest/task", (await import("../../core/test/models/task")).Task);
    this.addModel("webdatest/ident", (await import("../../core/test/models/ident")).Ident);
    return this;
  }
}

export const WebdaSampleApplication = new SourceTestApplication(path.resolve(`${__dirname}/../../../sample-app/`));

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
