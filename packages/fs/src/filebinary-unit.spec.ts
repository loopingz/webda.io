import { suite, test } from "@webda/test";
import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { Readable } from "stream";
import { FileBinary, FileBinaryParameters } from "./filebinary.js";
import { BinaryNotFoundError } from "@webda/core";

/**
 * Helper to create a FileBinary instance with proper parameters,
 * bypassing the full Webda application bootstrap.
 */
function createFileBinary(folder: string, opts: Record<string, any> = {}): FileBinary {
  const params = new FileBinaryParameters().load({ folder, ...opts });
  const binary = new FileBinary("testFileBinary", params);
  // Ensure the folder exists
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }
  return binary;
}

/**
 * Remove a directory and all contents recursively.
 */
function rmrf(dir: string) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

@suite
class FileBinaryParametersTest {
  @test
  folderTrailingSlash() {
    const params = new FileBinaryParameters().load({ folder: "/tmp/test" });
    assert.strictEqual(params.folder, "/tmp/test/");
  }

  @test
  folderAlreadyHasTrailingSlash() {
    const params = new FileBinaryParameters().load({ folder: "/tmp/test/" });
    assert.strictEqual(params.folder, "/tmp/test/");
  }

  @test
  defaultMaxSize() {
    const params = new FileBinaryParameters().load({ folder: "/tmp/test" });
    assert.strictEqual(params.maxSize, 10 * 1024 * 1024);
  }

  @test
  customMaxSize() {
    const params = new FileBinaryParameters().load({ folder: "/tmp/test", maxSize: 5000 });
    assert.strictEqual(params.maxSize, 5000);
  }

  @test
  urlTrailingSlashRemoved() {
    const params = new FileBinaryParameters().load({ folder: "/tmp/test", url: "http://localhost:8080/" });
    assert.strictEqual(params.url, "http://localhost:8080");
  }

  @test
  urlWithoutTrailingSlash() {
    const params = new FileBinaryParameters().load({ folder: "/tmp/test", url: "http://localhost:8080" });
    assert.strictEqual(params.url, "http://localhost:8080");
  }

  @test
  urlUndefined() {
    const params = new FileBinaryParameters().load({ folder: "/tmp/test" });
    assert.strictEqual(params.url, undefined);
  }
}

@suite
class FileBinaryUnitTest {
  tmpDir: string;
  binary: FileBinary;

  beforeEach() {
    this.tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fb-test-"));
    // Note: FileBinaryParameters.load adds trailing slash
    this.binary = createFileBinary(this.tmpDir);
  }

  afterEach() {
    rmrf(this.tmpDir);
  }

  @test
  getPathWithoutPostfix() {
    const p = this.binary._getPath("abc123");
    assert.strictEqual(p, this.binary.getParameters().folder + "abc123");
  }

  @test
  getPathWithPostfix() {
    const p = this.binary._getPath("abc123", "data");
    assert.strictEqual(p, this.binary.getParameters().folder + "abc123/data");
  }

  @test
  getPathWithUndefinedPostfix() {
    const p = this.binary._getPath("abc123", undefined);
    assert.strictEqual(p, this.binary.getParameters().folder + "abc123");
  }

  @test
  touchCreatesFile() {
    const filePath = path.join(this.tmpDir, "touchfile");
    assert.ok(!fs.existsSync(filePath));
    this.binary._touch(filePath);
    assert.ok(fs.existsSync(filePath));
  }

  @test
  touchDoesNotOverwrite() {
    const filePath = path.join(this.tmpDir, "touchfile2");
    fs.writeFileSync(filePath, "original");
    this.binary._touch(filePath);
    // File should still contain original content
    assert.strictEqual(fs.readFileSync(filePath, "utf-8"), "original");
  }

  @test
  touchIdempotent() {
    const filePath = path.join(this.tmpDir, "touchfile3");
    this.binary._touch(filePath);
    // Second touch should not throw
    this.binary._touch(filePath);
    assert.ok(fs.existsSync(filePath));
  }

  @test
  challengeReturnsFalseForMissingHash() {
    const result = this.binary.challenge("nonexistent", "challenge123");
    assert.strictEqual(result, false);
  }

  @test
  challengeReturnsFalseForMissingChallenge() {
    const hashDir = path.join(this.binary.getParameters().folder, "myhash");
    fs.mkdirSync(hashDir);
    const result = this.binary.challenge("myhash", "missingchallenge");
    assert.strictEqual(result, false);
  }

  @test
  challengeReturnsTrueWhenExists() {
    const hash = "testhash";
    const challenge = "testchallenge";
    const hashDir = path.join(this.binary.getParameters().folder, hash);
    fs.mkdirSync(hashDir);
    fs.writeFileSync(path.join(hashDir, `_${challenge}`), "");
    const result = this.binary.challenge(hash, challenge);
    assert.strictEqual(result, true);
  }

  @test
  async getUsageCountNoDirectory() {
    const count = await this.binary.getUsageCount("nonexistent");
    assert.strictEqual(count, 0);
  }

  @test
  async getUsageCountWithFiles() {
    const hash = "usage-hash";
    const hashDir = path.join(this.binary.getParameters().folder, hash);
    fs.mkdirSync(hashDir);
    // data file + challenge file = 2 "overhead" files
    fs.writeFileSync(path.join(hashDir, "data"), "content");
    fs.writeFileSync(path.join(hashDir, "_challenge"), "");
    // Usage markers
    fs.writeFileSync(path.join(hashDir, "Store_attr_uuid1"), "");
    fs.writeFileSync(path.join(hashDir, "Store_attr_uuid2"), "");
    const count = await this.binary.getUsageCount(hash);
    // files.length - 2 = 4 - 2 = 2
    assert.strictEqual(count, 2);
  }

  @test
  async getUsageCountEmptyDir() {
    const hash = "empty-hash";
    const hashDir = path.join(this.binary.getParameters().folder, hash);
    fs.mkdirSync(hashDir);
    const count = await this.binary.getUsageCount(hash);
    // 0 files - 2 = -2
    assert.strictEqual(count, -2);
  }

  @test
  async cleanHashRemovesDirectory() {
    const hash = "clean-hash";
    const hashDir = path.join(this.binary.getParameters().folder, hash);
    fs.mkdirSync(hashDir);
    fs.writeFileSync(path.join(hashDir, "data"), "content");
    fs.writeFileSync(path.join(hashDir, "_challenge"), "");

    assert.ok(fs.existsSync(hashDir));
    await this.binary._cleanHash(hash);
    assert.ok(!fs.existsSync(hashDir));
  }

  @test
  async cleanHashNonExistent() {
    // Should not throw
    await this.binary._cleanHash("nonexistent");
  }

  @test
  async cleanUsageNonExistent() {
    // Should not throw
    await this.binary._cleanUsage("nonexistent", "uuid1");
  }

  @test
  async cleanUsageRemovesMarker() {
    const hash = "usage-clean";
    const hashDir = path.join(this.binary.getParameters().folder, hash);
    fs.mkdirSync(hashDir);
    fs.writeFileSync(path.join(hashDir, "data"), "content");
    fs.writeFileSync(path.join(hashDir, "_challenge"), "");
    fs.writeFileSync(path.join(hashDir, "Store_attr_uuid1"), "");
    fs.writeFileSync(path.join(hashDir, "Store_attr_uuid2"), "");

    await this.binary._cleanUsage(hash, "uuid1", "attr");
    // The marker for uuid1 should be removed
    assert.ok(!fs.existsSync(path.join(hashDir, "Store_attr_uuid1")));
    // The other marker should still exist
    assert.ok(fs.existsSync(path.join(hashDir, "Store_attr_uuid2")));
  }

  @test
  async cleanUsageWithLeadingUnderscore() {
    const hash = "usage-clean2";
    const hashDir = path.join(this.binary.getParameters().folder, hash);
    fs.mkdirSync(hashDir);
    fs.writeFileSync(path.join(hashDir, "data"), "content");
    fs.writeFileSync(path.join(hashDir, "_challenge"), "");
    fs.writeFileSync(path.join(hashDir, "Store_attr__uuid1"), "");

    // UUID starting with underscore should not be double-prefixed
    await this.binary._cleanUsage(hash, "_uuid1", "attr");
    assert.ok(!fs.existsSync(path.join(hashDir, "Store_attr__uuid1")));
  }

  @test
  async cleanUsageCleansHashWhenOnlyThreeFiles() {
    const hash = "usage-clean3";
    const hashDir = path.join(this.binary.getParameters().folder, hash);
    fs.mkdirSync(hashDir);
    fs.writeFileSync(path.join(hashDir, "data"), "content");
    fs.writeFileSync(path.join(hashDir, "_challenge"), "");
    fs.writeFileSync(path.join(hashDir, "Store_attr_uuid1"), "");

    // With exactly 3 files and we remove one usage marker, it should clean the whole hash
    await this.binary._cleanUsage(hash, "uuid1", "attr");
    assert.ok(!fs.existsSync(hashDir));
  }

  @test
  async getThrowsBinaryNotFoundForMissing() {
    await assert.rejects(
      () => this.binary._get({ hash: "nonexistent" } as any),
      BinaryNotFoundError
    );
  }

  @test
  async getReturnsReadableStream() {
    const hash = "readable-hash";
    const hashDir = path.join(this.binary.getParameters().folder, hash);
    fs.mkdirSync(hashDir);
    fs.writeFileSync(path.join(hashDir, "data"), "hello binary content");

    const stream = await this.binary._get({ hash } as any);
    assert.ok(stream instanceof Readable);

    // Read the stream content
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    assert.strictEqual(Buffer.concat(chunks).toString(), "hello binary content");
  }

  @test
  computeParametersCreatesFolder() {
    const newDir = path.join(this.tmpDir, "new", "nested", "folder");
    const binary = createFileBinary(newDir);
    rmrf(newDir);
    assert.ok(!fs.existsSync(newDir));
    binary.computeParameters();
    assert.ok(fs.existsSync(newDir));
  }

  @test
  computeParametersExistingFolder() {
    // Should not throw if folder already exists
    this.binary.computeParameters();
    assert.ok(fs.existsSync(this.binary.getParameters().folder));
  }

  @test
  async cascadeDeleteCallsCleanUsage() {
    const hash = "cascade-hash";
    const hashDir = path.join(this.binary.getParameters().folder, hash);
    fs.mkdirSync(hashDir);
    fs.writeFileSync(path.join(hashDir, "data"), "content");
    fs.writeFileSync(path.join(hashDir, "_challenge"), "");
    fs.writeFileSync(path.join(hashDir, "Store_attr_myuuid"), "");

    await this.binary.cascadeDelete({ hash } as any, "myuuid");
    // Should have cleaned the usage
    assert.ok(!fs.existsSync(path.join(hashDir, "Store_attr_myuuid")));
  }

  @test
  loadParametersReturnsFileBinaryParameters() {
    const result = this.binary.loadParameters({ folder: "/tmp/bintest", maxSize: 999 });
    assert.ok(result instanceof FileBinaryParameters);
    assert.strictEqual(result.folder, "/tmp/bintest/");
    assert.strictEqual(result.maxSize, 999);
  }

  @test
  loadParametersDefaults() {
    const result = this.binary.loadParameters({ folder: "/tmp/bintest2" });
    assert.strictEqual(result.maxSize, 10 * 1024 * 1024);
    assert.strictEqual(result.folder, "/tmp/bintest2/");
  }

  @test
  async cleanUsageWithoutAttribute() {
    const hash = "usage-noattr";
    const hashDir = path.join(this.binary.getParameters().folder, hash);
    fs.mkdirSync(hashDir);
    fs.writeFileSync(path.join(hashDir, "data"), "content");
    fs.writeFileSync(path.join(hashDir, "_challenge"), "");
    fs.writeFileSync(path.join(hashDir, "Store_attr_uuid1"), "");
    fs.writeFileSync(path.join(hashDir, "Other_thing_uuid1"), "");

    // Without attribute parameter, should match any file ending with _uuid1
    await this.binary._cleanUsage(hash, "uuid1");
    assert.ok(!fs.existsSync(path.join(hashDir, "Store_attr_uuid1")));
    assert.ok(!fs.existsSync(path.join(hashDir, "Other_thing_uuid1")));
  }

  @test
  async cleanDataMethod() {
    const hash = "cleandata-hash";
    const hashDir = path.join(this.binary.getParameters().folder, hash);
    fs.mkdirSync(hashDir);
    fs.writeFileSync(path.join(hashDir, "data"), "content");
    assert.ok(fs.existsSync(hashDir));

    await this.binary.___cleanData();
    // Folder should be empty after clean
    const files = fs.readdirSync(this.binary.getParameters().folder);
    assert.strictEqual(files.length, 0);
  }

  @test
  async initEarlyReturnWithoutUrl() {
    // When url is undefined, init should return early without adding routes
    assert.strictEqual(this.binary.getParameters().url, undefined);
    // Should not throw
    await this.binary.init();
  }

  @test
  async getPathConsistency() {
    // Verify the folder has trailing slash and paths are correctly built
    const folder = this.binary.getParameters().folder;
    assert.ok(folder.endsWith("/"));
    const hashPath = this.binary._getPath("myhash");
    assert.strictEqual(hashPath, folder + "myhash");
    const dataPath = this.binary._getPath("myhash", "data");
    assert.strictEqual(dataPath, folder + "myhash/data");
  }
}

export { FileBinaryParametersTest, FileBinaryUnitTest };
