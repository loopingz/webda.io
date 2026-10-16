import { ContentNotFoundError } from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test";
import { ContentStorageContract } from "@webda/utils";
import { afterEach, beforeEach, suite, test } from "@webda/test";
import * as assert from "assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { vi } from "vitest";
import { FileBinary, FileBinaryParameters } from "./filebinary.service.js";

const TEST_DIR = path.join(os.tmpdir(), `webda-fs-content-${Date.now()}-${Math.random().toString(36).slice(2)}`);

@suite
class FileBinaryContentTest extends WebdaApplicationTest {
  private fileBinary: FileBinary;

  private contract = ContentStorageContract(async () => {
    return {
      storage: this.fileBinary,
      baseUrl: `file://${TEST_DIR}`
    };
  })();

  @beforeEach
  async beforeEach() {
    await super.beforeEach();
    fs.mkdirSync(TEST_DIR, { recursive: true });

    this.fileBinary = this.registerService(
      new FileBinary(
        "fsbinary",
        new FileBinaryParameters().load({
          folder: TEST_DIR
        })
      )
    ).resolve();

    await this.fileBinary.init();
    await this.contract.setup();
  }

  @afterEach
  async afterEach() {
    await this.contract.teardown();
    await this.fileBinary.stop();
    try {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    } catch {}
  }

  @test
  async roundTripBufferAndString() {
    await this.contract.roundTripBufferAndString();
  }

  @test
  async roundTripStreamWithoutLength() {
    await this.contract.roundTripStreamWithoutLength();
  }

  @test
  async missingKeyThrowsNotFoundError() {
    await this.contract.missingKeyThrowsNotFoundError();
  }

  @test
  async rangeReadReturnsExactBytes() {
    await this.contract.rangeReadReturnsExactBytes();
  }

  @test
  async ifNotExistsRejectsExistingKey() {
    await this.contract.ifNotExistsRejectsExistingKey();
  }

  @test
  async metadataAndHeadContent() {
    await this.contract.metadataAndHeadContent();
  }

  @test
  async streamErrorDoesNotLeaveCorruptedFile() {
    await this.contract.streamErrorDoesNotLeaveCorruptedFile();
  }

  @test
  async rejectsPathTraversalEscapingFolder() {
    const maliciousUrl = `file://${TEST_DIR}/../../etc/passwd`;
    await assert.rejects(
      async () => {
        await this.fileBinary.getContent(maliciousUrl);
      },
      (err: any) => err instanceof ContentNotFoundError && err.message.includes("Path traversal rejected")
    );
  }

  @test
  async deleteContentRemovesTheFile() {
    const url = `file://${path.join(TEST_DIR, "delete.txt")}`;
    await this.fileBinary.putContent(url, "body");
    await this.fileBinary.deleteContent(url);
    assert.strictEqual(await this.fileBinary.headContent(url), undefined);
  }

  @test
  async getPropagatesUnexpectedReadFailures() {
    vi.spyOn(this.fileBinary, "getContent").mockRejectedValueOnce(new Error("read failed"));
    await assert.rejects(this.fileBinary._get({ hash: "sample" } as any), /read failed/);
  }
}
