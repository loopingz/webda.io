import { suite, test } from "@webda/test";
import * as assert from "assert";
import { copyFile, mkdtemp, rm, utimes, writeFile } from "fs/promises";
import { resolve } from "path";
import { vi } from "vitest";
import { importEmail, loader, resolveModulePath } from "./loader.js";

@suite
class LoaderTest {
  tmpDirs: string[] = [];

  async afterEach() {
    vi.restoreAllMocks();
    await Promise.all(this.tmpDirs.map(d => rm(d, { recursive: true, force: true })));
    this.tmpDirs = [];
  }

  @test
  async importsTsxSource() {
    const email = await importEmail(resolve("test/emails/event-confirmation/email.tsx"));
    assert.strictEqual(typeof email, "function");
    assert.strictEqual(email.Subject, "You're registered! See you at the event");
  }

  @test
  async sourceMapPrefersCompiled() {
    const map = { "test/emails/": "test/lib/" };
    const email = await importEmail(resolve("test/emails/compiled-src/email.tsx"), map);
    assert.strictEqual(email.Subject, "from lib");
    const missing = resolve("test/emails/event-confirmation/email.tsx");
    assert.strictEqual(resolveModulePath(missing, map), missing);
  }

  @test
  async sameFileImportedOnce() {
    const path = resolve("test/emails/event-confirmation/email.tsx");
    assert.strictEqual(await importEmail(path), await importEmail(path));
  }

  @test
  async reloadsWhenChanged() {
    const dir = await mkdtemp(resolve("test/tmp-"));
    this.tmpDirs.push(dir);
    const file = resolve(dir, "email.tsx");
    await copyFile(resolve("test/emails/compiled-src/email.tsx"), file);
    assert.strictEqual((await importEmail(file)).Subject, "from source");
    await writeFile(file, 'export default function Changed() { return "x"; }\nChanged.Subject = "changed";\n');
    const later = new Date(Date.now() + 5000);
    await utimes(file, later, later);
    assert.strictEqual((await importEmail(file)).Subject, "changed");
  }

  @test
  async noDefaultExport() {
    await assert.rejects(() => importEmail(resolve("test/emails/no-default/email.tsx")), /no default export/);
  }

  @test
  async missingCompiledModuleExplains() {
    const err: any = new Error("Unknown file extension");
    err.code = "ERR_UNKNOWN_FILE_EXTENSION";
    vi.spyOn(loader, "importModule").mockRejectedValue(err);
    const path = resolve("test/emails/compiled-src/email.tsx");
    await assert.rejects(
      () => importEmail(path),
      (e: Error) => e.message.includes(path) && e.message.includes("sourceMap")
    );
  }
}
