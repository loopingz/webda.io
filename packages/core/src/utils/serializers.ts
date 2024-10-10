import {
  createReadStream,
  createWriteStream,
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync
} from "fs";
import * as jsonc from "jsonc-parser";
import { join } from "path";
import { Readable, Transform, TransformCallback, Writable } from "stream";
import * as yaml from "yaml";
import { createGunzip, gunzipSync, gzipSync } from "zlib";
import { useLog } from "../loggers/hooks";

type WalkerOptionsType = {
  followSymlinks?: boolean;
  resolveSymlink?: boolean;
  includeDir?: boolean;
  skipHidden?: boolean;
  maxDepth?: number;
};
type FinderOptionsType = WalkerOptionsType & { filterPattern?: RegExp; processor?: (filepath: string) => void };

/**
 * NDJSONStream is a Readable stream that emits JSON objects separated by newlines.
 */
export class NDJSONStream extends Readable {
  private data: any[];
  private index: number = 0;

  constructor(data: any[]) {
    super();
    this.data = data;
  }

  _read() {
    if (this.index >= this.data.length) {
      this.push(null);
      return;
    }
    this.push(JSON.stringify(this.data[this.index++]) + "\n");
  }
}

/**
 * Read a NDJSON stream
 */
export class NDJSonReader extends Writable {
  current: string = "";
  _write(chunk: any, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    const res = chunk.toString().split("\n");
    res[0] = this.current + res[0];
    for (let i = 0; i < res.length - 1; i++) {
      this.emit("data", JSON.parse(res[i]));
    }
    this.current = res[res.length - 1];
    callback();
  }
}

/**
 * Gunzip a stream only if it is gzipped
 */
export class GunzipConditional extends Transform {
  first: boolean = true;
  zlib: Transform;
  destination: NodeJS.WritableStream;
  source: any;

  constructor() {
    super();
    this.on("pipe", source => {
      this.source = source;
    });
  }

  pipe<T extends NodeJS.WritableStream>(destination: T, options?: { end?: boolean }): T {
    this.destination = destination;
    return super.pipe(destination, options);
  }

  _transform(chunk: any, encoding: BufferEncoding, callback: TransformCallback): void {
    if (this.first && chunk[0] === 0x1f && chunk[1] === 0x8b) {
      this.zlib = createGunzip();
      this.unpipe();
      this.source.unpipe(this);
      this.source.pipe(this.zlib);
      this.zlib.pipe(this.destination);
      this.zlib.write(chunk, encoding);
    } else {
      this.push(chunk, encoding);
    }
    this.first = false;
    callback();
  }
}

/**
 * Type of format managed
 */
type Format = "json" | "yaml";
/**
 * Define a Finder that can be use
 */
export interface StorageFinder {
  /**
   * Recursively browse the path and call processor on each
   */
  walk(path: string, processor: (filepath: string) => void, options?: WalkerOptionsType, depth?: number): Promise<void>;
  /**
   * Find
   */
  find(currentPath: string, options?: FinderOptionsType): Promise<string[]>;
  /**
   * Get a write stream based on the id return by the finder
   */
  getWriteStream(path: string): Promise<Writable>;
  /**
   * Get a read stream based on the id return by the finder
   */
  getReadStream(path: string): Promise<Readable>;
}

/**
 * Guess format to use for a filename
 * @param filename
 * @returns
 */
function getFormatFromFilename(filename: string): Format {
  if (filename.match(/\.ya?ml$/i)) {
    return "yaml";
  } else if (filename.match(/\.jsonc?$/i)) {
    return "json";
  }
  throw new Error("Unknown format: " + filename);
}
/**
 * Allow save/load of yaml or json file
 */
export const FileUtils: StorageFinder & {
  save: (object: any, filename: string, publicAudience?: boolean, format?: Format) => void;
  load: (filename: string, format?: Format) => any;
  clean: (...files: string[]) => void;
  walkSync: (path: string, processor: (filepath: string) => void, options?: WalkerOptionsType, depth?: number) => void;
} = {
  /**
   * @override
   */
  getWriteStream: async (path: string) => {
    return createWriteStream(path);
  },

  getReadStream: async (path: string) => {
    return createReadStream(path);
  },
  walkSync: (
    path: string,
    processor: (filepath: string) => void,
    options: WalkerOptionsType = { maxDepth: 100 },
    depth: number = 0
  ) => {
    const files = !options.skipHidden ? readdirSync(path) : readdirSync(path).filter(f => !f.startsWith("."));
    const fileItemCallback = async p => {
      try {
        const stat = lstatSync(p);
        if (stat.isDirectory()) {
          if (options.includeDir) {
            processor(p);
          }
          // folder found, trying to dig further
          if (!options.maxDepth || depth < options.maxDepth) {
            // unless we reached the maximum depth
            FileUtils.walkSync(p, processor, options, depth + 1);
          }
        } else if (stat.isSymbolicLink() && options.followSymlinks) {
          let realPath;
          try {
            // realpathSync will throw if the symlink is broken
            realPath = realpathSync(p);
          } catch (err) {
            return;
          }
          const stat = lstatSync(realPath);
          if (stat.isDirectory()) {
            // symlink targets a folder
            if (options.followSymlinks) {
              // following below
              if (!options.maxDepth || depth < options.maxDepth) {
                // unless we reached the maximum depth
                FileUtils.walkSync(options.resolveSymlink ? realPath : p, processor, options, depth + 1);
              }
            }
          } else {
            // symlink targets a file
            // we should still send the symlink to the processor
            processor(options.resolveSymlink ? realPath : p);
          }
        } else if (stat.isFile()) {
          processor(p);
        }
        /* c8 ignore start */
      } catch (err) {
        useLog("ERROR", "FileUtils.find: Error while reading file", p, err);
      }
      /* c8 ignore stop */
    };
    files.map(f => join(path, f)).forEach(fileItemCallback);
  },
  /**
   * Recursively run a process through all descendant files under a path
   *
   * @param {string} path
   * @param {Function} processor Processing function, eg: (filepath: string) => void
   * @param {string} currentPath Path to dig
   * @param {boolean} options.followSymlinks Follow symlinks which targets a folder
   * @param {boolean} options.includeDir Include folders to results transmitted to the processor function
   * @param {number} options.maxDepth Maximum depth level to investigate, default is 100 to prevent infinite loops
   * @param {number} state.depth Starting level counter
   */
  walk: async (
    path: string,
    processor: (filepath: string) => void,
    options: WalkerOptionsType = { maxDepth: 100 },
    depth: number = 0
  ): Promise<void> => {
    FileUtils.walkSync(path, processor, options, depth);
  },
  /**
   * Find files below a provided path, optionally filtered by a RegExp pattern
   * Without pattern provided, ALL FOUND FILES will be returned by default
   *
   * @param {string} currentPath Path to explore
   * @param {boolean} options.followSymlinks Follow symlinks which targets a folder
   * @param {boolean} options.includeDir Include folders to results transmitted to the processor function
   * @param {number} options.maxDepth Maximum depth level to investigate
   * @param {RegExp} options.filterPattern RegExp pattern to filter, no filter will find all files
   * @returns
   */
  find: async (currentPath: string, options: FinderOptionsType = { maxDepth: 3 }) => {
    const found = [];
    const processor = (filepath: string) => {
      if (!options.filterPattern || options.filterPattern.test(filepath)) {
        // unless an existing regexp filter forces to skip
        found.push(filepath);
      }
    };
    await FileUtils.walk(currentPath, processor, options);
    return found;
  },
  /**
   * Load a YAML or JSON file based on its extension
   *
   * @param filename to load
   * @returns
   */
  load: (filename, format?: Format) => {
    if (!existsSync(filename)) {
      throw new Error(`File '${filename}' does not exist.`);
    }
    let content;
    if (filename.endsWith(".gz")) {
      content = gunzipSync(readFileSync(filename)).toString();
      filename = filename.slice(0, -3);
    } else {
      content = readFileSync(filename, "utf-8");
    }
    format ??= getFormatFromFilename(filename);
    if (format === "yaml") {
      const res = yaml.parseAllDocuments(content);
      if (res.length === 1) {
        return res.pop().toJSON();
      }
      return res.map(d => d.toJSON());
    } else if (format === "json") {
      if (filename.endsWith("c")) {
        return jsonc.parse(content);
      }
      return JSON.parse(content);
    }
  },
  /**
   * Save a YAML or JSON file based on its extension
   *
   * @param object to serialize
   * @param filename to save
   * @returns
   */
  save: (object, filename = "", publicAudience: boolean = false, format?: Format) => {
    if (filename.endsWith(".gz")) {
      format ??= getFormatFromFilename(filename.slice(0, -3));
    } else {
      format ??= getFormatFromFilename(filename);
    }
    let res;
    if (format === "yaml") {
      res = yaml.stringify(JSON.parse(JSONUtils.stringify(object, undefined, 0, publicAudience)));
    } else if (format === "json") {
      res = JSONUtils.stringify(object, undefined, 2, publicAudience);
    }
    if (filename.endsWith(".gz")) {
      res = gzipSync(res);
    }
    writeFileSync(filename, res);
  },
  /**
   * Delete files if exists
   * @param files
   */
  clean: (...files: string[]) => {
    files.filter(f => existsSync(f)).forEach(f => unlinkSync(f));
  }
};

/**
 * Simple JSON utils
 */
export const JSONUtils = {
  /**
   * Safe Stringify stringify a object included circular object
   * and also remove any attributes starting with a __
   *
   * @param value
   * @param replacer
   * @param space
   * @returns
   */
  safeStringify: (
    value,
    replacer: (key: string, value: any) => any = undefined,
    space: number | string = 2,
    publicAudience: boolean = false
  ) => {
    const stringified = [];
    return JSON.stringify(
      value,
      (key: string, val: any): any => {
        if ((stringified.indexOf(val) >= 0 && typeof val === "object") || (key.startsWith("__") && publicAudience)) {
          return undefined;
        }
        stringified.push(val);
        if (replacer) {
          return replacer.bind(this, key, val)();
        }
        if (val === null) {
          return;
        }
        return val;
      },
      space
    );
  },
  /**
   * See JSON.stringify
   *
   * @param value
   * @param replacer
   * @param space
   * @returns
   */
  stringify: (
    value,
    replacer: (key: string, value: any) => any = undefined,
    space: number | string = 2,
    publicAudience: boolean = false
  ) => {
    // Add a fallback if first did not work because of recursive
    try {
      return JSON.stringify(
        value,
        (key: string, val: any) => {
          if (key.startsWith("__") && publicAudience) {
            return undefined;
          }
          if (replacer) {
            return replacer.bind(this, key, val)();
          }
          if (val === null) {
            return;
          }
          return val;
        },
        space
      );
    } catch (err) {
      if (err.message && err.message.startsWith("Converting circular structure to JSON")) {
        return JSONUtils.safeStringify(value, replacer, space, publicAudience);
      }
      throw err;
    }
  },
  /**
   * Parse a JSON data
   *
   * @param value to parse
   * @returns object parsed
   */
  parse: value => {
    // Auto clean any noise
    return JSON.parse(value);
  },
  /**
   * Duplicate an object using serializer
   */
  duplicate: value => {
    return JSON.parse(JSONUtils.stringify(value));
  },
  /**
   * Visit a json/jsonc file for update
   * @param filename
   */
  updateFile: async (filename: string, replacer: (value: any) => any) => {
    const content = readFileSync(filename).toString().trim();
    const edits: jsonc.EditResult = [];
    const promises: Promise<void>[] = [];
    jsonc.visit(content, {
      onLiteralValue(value, offset, length, startLine, startCharacter, pathSupplier) {
        promises.push(
          (async () => {
            const newValue = await replacer(value);
            if (value !== newValue) {
              edits.push({ offset, length, content: JSON.stringify(newValue, undefined, 2) });
            }
          })()
        );
      }
    });
    //
    await Promise.all(promises);
    writeFileSync(filename, jsonc.applyEdits(content, edits));
  },
  /**
   * Helper to FileUtils.save
   */
  loadFile: (filename: string) => FileUtils.load(filename, "json"),
  /**
   * Helper to FileUtils.save
   */
  saveFile: (object: any, filename: string, publicAudience?: boolean) =>
    FileUtils.save(object, filename, publicAudience, "json"),

  /**
   * Sort object keys
   * @param unordered
   * @returns
   */
  sortObject: (unordered: any, transformer: (obj: any) => any = a => a): any => {
    return Object.keys(unordered)
      .sort()
      .reduce((obj, key) => {
        const res = transformer(unordered[key]);
        if (!res) {
          return obj;
        }
        obj[key] = res;
        return obj;
      }, {});
  }
};

/**
 * Expose basic YAML function
 */
export const YAMLUtils = {
  /**
   * Helper to FileUtils.save
   */
  loadFile: (filename: string) => FileUtils.load(filename, "yaml"),
  /**
   * Helper to FileUtils.save
   */
  saveFile: (object: any, filename: string, publicAudience?: boolean) =>
    FileUtils.save(object, filename, publicAudience, "yaml"),
  /**
   * Duplicate an object using serializer
   */
  duplicate: JSONUtils.duplicate,
  /**
   * Parse a single or multiple document yaml
   *
   * @param value to parse
   * @returns object parsed
   */
  parse: value => {
    const res = yaml.parseAllDocuments(value);
    if (res.length === 1) {
      return res.pop().toJSON();
    }
    return res.map(d => d.toJSON());
  },
  /**
   * YAML helper
   * @param value to serialize
   * @param options as defined by https://eemeli.org/yaml/v1/#yaml-stringify
   * @returns
   */
  stringify: (value, options = undefined) => {
    return yaml.stringify(value, options);
  }
};
