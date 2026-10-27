import fsMutable from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { mkdtempSync, rmSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { vi } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MediaTypes, sha256 } from "./oci.js";
import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";
import { forceUnixGzipOs, ImageLayout } from "./layout.js";

/**
 * Pipe a buffer through a transform, one byte per chunk
 * @param data - the data
 * @returns the transformed data
 */
async function byteByByte(data: Buffer): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of Readable.from([...data].map(byte => Buffer.from([byte]))).pipe(forceUnixGzipOs())) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

@suite
class LayoutTest {
  @test
  exclusiveBlobCreationDoesNotOverwriteExistingFiles() {
    const folder = mkdtempSync(join(tmpdir(), "webda-oci-exclusive-"));
    try {
      const layout = new ImageLayout(folder);
      const data = Buffer.from("blob content");
      const descriptor = layout.writeBlob(data, MediaTypes.OCI_CONFIG);
      assert.deepStrictEqual(layout.writeBlob(data, MediaTypes.OCI_CONFIG), descriptor);
      assert.ok(layout.readBlob(descriptor.digest).equals(data));
      if (process.platform !== "win32") {
        const other = Buffer.from("other content");
        const target = join(folder, "target");
        writeFileSync(target, "keep");
        const dataPath = layout.blobPath(sha256(other));
        const write = writeFileSync;
        let raced = false;
        const stub = vi.spyOn(fsMutable, "writeFileSync").mockImplementation((file, data, options) => {
          if (file === dataPath && !raced) {
            raced = true;
            symlinkSync(target, dataPath);
          }
          return write(file, data, options);
        });
        try {
          syncBuiltinESMExports();
          layout.writeBlob(other, MediaTypes.OCI_CONFIG);
        } finally {
          stub.mockRestore();
          syncBuiltinESMExports();
        }
        assert.ok(raced);
        assert.strictEqual(readFileSync(target, "utf8"), "keep");
      }
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  }

  @test
  async gzipOsByteWhateverTheChunks() {
    const gzip = gzipSync(Buffer.from("reproducible layer content"));
    gzip[9] = 11;
    const expected = Buffer.from(gzip);
    expected[9] = 3;
    // Only the OS field of the header changes, even when the stream comes in tiny chunks
    assert.deepStrictEqual(await byteByByte(gzip), expected);
  }
}
