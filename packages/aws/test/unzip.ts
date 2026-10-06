import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

/**
 * A file read from a zip archive
 */
export interface UnzippedEntry {
  name: string;
  method: number;
  mode: number;
  crc: number;
  data: Buffer;
}

/**
 * Read a zip archive through its central directory, for the tests
 *
 * @param zipPath - the archive
 * @returns the entries in order
 */
export function readZip(zipPath: string): UnzippedEntry[] {
  const zip = readFileSync(zipPath);
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = zip.readUInt16LE(end + 10);
  let offset = zip.readUInt32LE(end + 16);
  const entries: UnzippedEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error("Invalid central directory");
    }
    const method = zip.readUInt16LE(offset + 10);
    const crc = zip.readUInt32LE(offset + 16);
    const compressed = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const mode = zip.readUInt32LE(offset + 38) >>> 16;
    const local = zip.readUInt32LE(offset + 42);
    const name = zip.toString("utf8", offset + 46, offset + 46 + nameLength);
    const localName = zip.readUInt16LE(local + 26);
    const localExtra = zip.readUInt16LE(local + 28);
    const start = local + 30 + localName + localExtra;
    const body = zip.subarray(start, start + compressed);
    entries.push({ name, method, mode, crc, data: method === 8 ? inflateRawSync(body) : Buffer.from(body) });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}
