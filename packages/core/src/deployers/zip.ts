import { closeSync, mkdirSync, openSync, readFileSync, writeSync } from "node:fs";
import { dirname } from "node:path";
import { deflateRawSync } from "node:zlib";

/**
 * A file to add to a zip archive
 */
export interface ZipEntry {
  /**
   * Posix path of the file within the archive
   */
  target: string;
  /**
   * Path of the file to read, when there is no content
   */
  source?: string;
  /**
   * Content of the file
   */
  content?: string | Buffer;
  /**
   * Unix file mode
   *
   * @default 0o644
   */
  mode?: number;
}

/**
 * CRC32 lookup table
 */
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

/**
 * Compute the CRC32 of a buffer
 * @param data - the buffer
 * @returns the unsigned CRC32
 */
export function crc32(data: Buffer): number {
  let crc = -1;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

/**
 * DOS date of 1980-01-01: entries have a fixed date so the same content gives the same archive
 */
const DOS_DATE = (0 << 9) | (1 << 5) | 1;
/**
 * Flag of the UTF-8 file names
 */
const UTF8_FLAG = 0x0800;

/**
 * Write a zip archive
 *
 * The archive is deterministic: entries are written in the given order with a fixed date,
 * so the same files give the same archive (and the same S3 ETag).
 * Zip64 is not supported: at most 65535 entries and 4GB.
 *
 * @param zipPath - the archive to write
 * @param entries - the files
 * @returns the size of the archive
 */
export function writeZip(zipPath: string, entries: ZipEntry[]): number {
  if (entries.length > 0xffff) {
    throw new Error(`Too many files for a zip archive: ${entries.length}`);
  }
  mkdirSync(dirname(zipPath), { recursive: true });
  const fd = openSync(zipPath, "w");
  let offset = 0;
  const central: Buffer[] = [];
  const write = (buffer: Buffer) => {
    writeSync(fd, buffer);
    offset += buffer.length;
  };
  try {
    for (const entry of entries) {
      const data = entry.source !== undefined ? readFileSync(entry.source) : Buffer.from(entry.content ?? "");
      const deflated = deflateRawSync(data);
      // Store the file if compression does not help
      const method = deflated.length < data.length ? 8 : 0;
      const body = method === 8 ? deflated : data;
      const crc = crc32(data);
      const name = Buffer.from(entry.target, "utf8");
      if (offset + body.length + 30 + name.length > 0xffffffff) {
        throw new Error("Zip archive larger than 4GB is not supported");
      }
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(20, 4);
      local.writeUInt16LE(UTF8_FLAG, 6);
      local.writeUInt16LE(method, 8);
      local.writeUInt16LE(0, 10);
      local.writeUInt16LE(DOS_DATE, 12);
      local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(body.length, 18);
      local.writeUInt32LE(data.length, 22);
      local.writeUInt16LE(name.length, 26);
      local.writeUInt16LE(0, 28);
      const header = Buffer.alloc(46);
      header.writeUInt32LE(0x02014b50, 0);
      // Made by unix (3) so the file mode is kept
      header.writeUInt16LE((3 << 8) | 20, 4);
      header.writeUInt16LE(20, 6);
      header.writeUInt16LE(UTF8_FLAG, 8);
      header.writeUInt16LE(method, 10);
      header.writeUInt16LE(0, 12);
      header.writeUInt16LE(DOS_DATE, 14);
      header.writeUInt32LE(crc, 16);
      header.writeUInt32LE(body.length, 20);
      header.writeUInt32LE(data.length, 24);
      header.writeUInt16LE(name.length, 28);
      header.writeUInt16LE(0, 30);
      header.writeUInt16LE(0, 32);
      header.writeUInt16LE(0, 34);
      header.writeUInt16LE(0, 36);
      header.writeUInt32LE((((entry.mode ?? 0o644) & 0xffff) | 0o100000) * 0x10000, 38);
      header.writeUInt32LE(offset, 42);
      central.push(header, name);
      write(local);
      write(name);
      write(body);
    }
    const centralOffset = offset;
    for (const buffer of central) {
      write(buffer);
    }
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(offset - centralOffset, 12);
    end.writeUInt32LE(centralOffset, 16);
    end.writeUInt16LE(0, 20);
    write(end);
  } finally {
    closeSync(fd);
  }
  return offset;
}
