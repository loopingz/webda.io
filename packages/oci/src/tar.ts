import { createReadStream, statSync } from "node:fs";

/**
 * Size of a tar block
 */
const BLOCK = 512;

/**
 * An entry of a tar archive
 */
export interface TarEntry {
  /**
   * Posix path within the archive, without leading `/`; directories end without `/`
   */
  path: string;
  /**
   * Entry type
   */
  type: "file" | "directory";
  /**
   * Permission bits
   */
  mode: number;
  /**
   * Content of the file, when there is no source
   */
  content?: Buffer;
  /**
   * File to read the content from
   */
  source?: string;
}

/**
 * Options shared by every entry, so the archive is reproducible
 */
export interface TarOptions {
  /**
   * Modification time of every entry, in seconds
   *
   * @default 0
   */
  mtime?: number;
  /**
   * Owner of every entry
   *
   * @default 0
   */
  uid?: number;
  /**
   * Group of every entry
   *
   * @default 0
   */
  gid?: number;
}

/**
 * Write an octal number field, NUL terminated
 *
 * @param header - the header block
 * @param offset - offset of the field
 * @param length - length of the field
 * @param value - the number
 */
function writeOctal(header: Buffer, offset: number, length: number, value: number) {
  header.write(value.toString(8).padStart(length - 1, "0") + "\0", offset, length, "ascii");
}

/**
 * Build a PAX extended header record: `<length> <key>=<value>\n`, the length counts itself
 *
 * @param key - the key
 * @param value - the value
 * @returns the record
 */
export function paxRecord(key: string, value: string): Buffer {
  const body = ` ${key}=${value}\n`;
  const bodyLength = Buffer.byteLength(body);
  let length = bodyLength + 1;
  while (`${length}`.length + bodyLength !== length) {
    length = `${length}`.length + bodyLength;
  }
  return Buffer.from(`${length}${body}`);
}

/**
 * Build a ustar header block
 *
 * @param name - the name, at most 100 bytes
 * @param typeflag - `0` file, `5` directory, `x` PAX header
 * @param mode - permission bits
 * @param size - size of the content
 * @param options - shared options
 * @returns the 512 bytes header
 */
function header(name: string, typeflag: string, mode: number, size: number, options: TarOptions): Buffer {
  const block = Buffer.alloc(BLOCK);
  block.write(name, 0, 100, "utf8");
  writeOctal(block, 100, 8, mode & 0o7777);
  writeOctal(block, 108, 8, options.uid ?? 0);
  writeOctal(block, 116, 8, options.gid ?? 0);
  writeOctal(block, 124, 12, size);
  writeOctal(block, 136, 12, options.mtime ?? 0);
  block.write(typeflag, 156, 1, "ascii");
  block.write("ustar\0", 257, 6, "ascii");
  block.write("00", 263, 2, "ascii");
  // Checksum is computed with the checksum field filled with spaces
  block.fill(" ", 148, 156);
  let checksum = 0;
  for (const byte of block) {
    checksum += byte;
  }
  block.write(checksum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");
  return block;
}

/**
 * Padding to complete the last block of a content
 *
 * @param size - size of the content
 * @returns the padding, possibly empty
 */
function padding(size: number): Buffer {
  const remainder = size % BLOCK;
  return Buffer.alloc(remainder ? BLOCK - remainder : 0);
}

/**
 * Compare two posix paths component by component, so a directory comes right before its content
 *
 * @param a - first path
 * @param b - second path
 * @returns the sort order
 */
export function comparePaths(a: string, b: string): number {
  const left = a.split("/");
  const right = b.split("/");
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    if (left[i] !== right[i]) {
      return Buffer.compare(Buffer.from(left[i]), Buffer.from(right[i]));
    }
  }
  return left.length - right.length;
}

/**
 * Add the missing parent directories of the entries and sort them
 *
 * @param entries - the entries
 * @param directoryMode - mode of the added directories
 * @returns the complete sorted list
 */
export function withDirectories(entries: TarEntry[], directoryMode: number = 0o755): TarEntry[] {
  const byPath = new Map<string, TarEntry>();
  for (const entry of entries) {
    const path = entry.path.replace(/^\/+/, "").replace(/\/+$/, "");
    if (!path) {
      continue;
    }
    if (byPath.has(path)) {
      throw new Error(`Duplicate entry '${path}' in the archive`);
    }
    byPath.set(path, { ...entry, path });
    const parts = path.split("/");
    for (let i = 1; i < parts.length; i++) {
      const parent = parts.slice(0, i).join("/");
      if (!byPath.has(parent)) {
        byPath.set(parent, { path: parent, type: "directory", mode: directoryMode });
      }
    }
  }
  return [...byPath.values()].sort((a, b) => comparePaths(a.path, b.path));
}

/**
 * Generate a reproducible tar archive
 *
 * Every entry gets the same owner and modification time, names longer than the ustar limit
 * use a PAX extended header. Entries are written in the given order.
 *
 * @param entries - the entries, see {@link withDirectories}
 * @param options - shared options
 * @yields the archive chunks
 */
export async function* generateTar(entries: TarEntry[], options: TarOptions = {}): AsyncGenerator<Buffer> {
  for (const entry of entries) {
    const name = entry.type === "directory" ? `${entry.path}/` : entry.path;
    const size = entry.type === "file" ? (entry.content?.length ?? statSync(entry.source).size) : 0;
    if (Buffer.byteLength(name) > 100) {
      const pax = paxRecord("path", name);
      yield header("PaxHeader", "x", 0o644, pax.length, options);
      yield pax;
      yield padding(pax.length);
    }
    yield header(
      Buffer.byteLength(name) > 100 ? name.substring(0, 99) : name,
      entry.type === "file" ? "0" : "5",
      entry.mode,
      size,
      options
    );
    if (entry.type !== "file") {
      continue;
    }
    if (entry.content) {
      yield entry.content;
    } else {
      let read = 0;
      for await (const chunk of createReadStream(entry.source)) {
        read += chunk.length;
        if (read > size) {
          throw new Error(`File '${entry.source}' changed while archiving`);
        }
        yield chunk;
      }
      if (read !== size) {
        throw new Error(`File '${entry.source}' changed while archiving`);
      }
    }
    yield padding(size);
  }
  // End of archive: two empty blocks
  yield Buffer.alloc(BLOCK * 2);
}
