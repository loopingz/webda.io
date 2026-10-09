import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";
import { forceUnixGzipOs } from "./layout.js";

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
  async gzipOsByteWhateverTheChunks() {
    const gzip = gzipSync(Buffer.from("reproducible layer content"));
    gzip[9] = 11;
    const expected = Buffer.from(gzip);
    expected[9] = 3;
    // Only the OS field of the header changes, even when the stream comes in tiny chunks
    assert.deepStrictEqual(await byteByByte(gzip), expected);
  }
}
