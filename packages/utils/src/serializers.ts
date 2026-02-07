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
} from "node:fs";
import { join, resolve } from "path";
import { Readable, Transform, TransformCallback, Writable } from "stream";
import * as yaml from "yaml";
import { createGunzip, gunzipSync, gzipSync } from "zlib";
import { useLog } from "@webda/workout";
import { YAMLProxy } from "./yamlproxy";
import { JSONCParser as JSONC } from "./jsoncparser";
import { dirname } from "node:path";

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
 * Use a buffer to store the stream
 */
export class BufferWritableStream extends Writable {
  chunks = [];
  buffer: Buffer;
  ends: Promise<Buffer>;
  public constructor() {
    super({
      write: (chunk, encoding, callback) => {
        this.chunks.push(chunk);
        callback();
      },
      final: callback => {
        callback();
      },
      emitClose: true
    });
    this.ends = new Promise((resolve, reject) => {
      this.once("close", () => {
        resolve(this.buffer);
      });
      this.once("error", err => {
        reject(err);
      });
    });
    this.on("finish", () => {
      this.buffer = Buffer.concat(this.chunks);
    });
  }

  /**
   * Get the buffer
   * @returns
   */
  async get(): Promise<Buffer> {
    return this.ends;
  }
}

/**
 * Gunzip a stream only if it is gzipped
 */
export class GunzipConditional extends Transform {
  first: boolean = true;
  zlib: Transform;

  _transform(chunk: any, encoding: BufferEncoding, callback: TransformCallback): void {
    // Check if the first chunk is a gzip header
    if (this.first && chunk[0] === 0x1f && chunk[1] === 0x8b) {
      this.zlib = createGunzip();
      this.zlib.on("data", data => {
        this.push(data);
      });
      this.zlib.on("end", () => {
        super.end();
      });
    }
    // If we have a zlib we should write to it
    if (this.zlib) {
      this.zlib.write(chunk, encoding);
    } else {
      // Otherwise we should push the chunk
      this.push(chunk, encoding);
    }
    this.first = false;
    callback();
  }

  /**
   * If end is called, we should end the zlib if exists
   * @param args
   * @returns
   */
  end(...args): this {
    if (this.zlib) {
      this.zlib.end(...args);
    } else {
      super.end(...args);
    }
    return this;
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
  /**
   * Save a YAML or JSON file based on its extension
   *
   * You can compress files too if you add a .gz extension
   *
   * @param object to serialize
   * @param filename to save
   * @returns
   *
   * @example
   * ```ts
   * FileUtils.save({ hello: "world" }, "test.json");
   * FileUtils.save({ hello: "world" }, "test.yaml");
   * FileUtils.save({ hello: "world" }, "test.json.gz");
   * FileUtils.save({ hello: "world" }, "test.yaml.gz");
   * ```
   */
  save: (object: any, filename: string, format?: Format) => void;
  load: (filename: string, format?: Format) => any;
  loadConfigurationFile: (filename: string, allowImports?: boolean) => any;
  getConfigurationFile: (filename: string) => string;
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
   * Faster than the synchronous version
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
    // TODO use fs.promises
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
  getConfigurationFile(filename) {
    const file = ["yaml", "yml", "jsonc", "json"].find(v => existsSync(filename + `.${v}`));
    if (file) {
      return `${filename}.${file}`;
    }
    throw new Error("File not found " + filename + ".(ya?ml|jsonc?)");
  },
  /**
   * Load a YAML or JSON configuration file based on its extension
   * If allowImports is true, will also process any $import directive found in the file
   * $import can be a single string or an array of strings
   * @param filename
   * @param allowImports
   * @returns
   */
  loadConfigurationFile(filename, allowImports: boolean = true) {
    const data = FileUtils.load(FileUtils.getConfigurationFile(filename));
    if (allowImports && data && typeof data === "object") {
      const processImport = (importItem: string) => {
        const importFile = resolve(join(dirname(filename), importItem));
        if (!importFile.endsWith(importItem)) {
          useLog(
            "WARN",
            `FileUtils.loadConfigurationFile: Ignoring import with invalid path '${importItem}' in '${filename}'`
          );
          return;
        }
        Object.assign(data, FileUtils.loadConfigurationFile(importFile, true));
      };
      if (data.$import) {
        if (Array.isArray(data.$import)) {
          data.$import.forEach((importItem: string) => {
            processImport(importItem);
          });
        } else if (typeof data.$import === "string") {
          processImport(data.$import);
        }
        delete data.$import;
      }
    }
    return data;
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
      content = gunzipSync(readFileSync(filename) as Uint8Array).toString();
      filename = filename.slice(0, -3);
    } else {
      content = readFileSync(filename, "utf-8");
    }
    format ??= getFormatFromFilename(filename);
    if (format === "yaml") {
      return YAMLProxy.parse(content);
    } else if (format === "json") {
      if (filename.endsWith("c")) {
        return JSONC.parse(content);
      }
      return JSON.parse(content);
    }
  },

  save: (object, filename = "", format?: Format) => {
    if (filename.endsWith(".gz")) {
      format ??= getFormatFromFilename(filename.slice(0, -3));
    } else {
      format ??= getFormatFromFilename(filename);
    }
    let res;
    if (format === "yaml") {
      res = YAMLProxy.stringify(object);
    } else if (format === "json") {
      res = JSONC.stringify(object, undefined, 2);
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
  safeStringify: (value, replacer: (key: string, value: any) => any = undefined, space: number | string = 2) => {
    const stringified = [];
    return JSON.stringify(
      value,
      (key: string, val: any): any => {
        if (stringified.indexOf(val) >= 0 && typeof val === "object") {
          return undefined;
        }
        stringified.push(val);
        if (replacer) {
          return replacer.bind(this, key, val)();
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
    const fullReplacer = (key: string, val: any) => {
      if (key.startsWith("__") && publicAudience) {
        return undefined;
      }
      if (replacer) {
        return replacer.bind(this, key, val)();
      }
      return val;
    };
    // Add a fallback if first did not work because of recursive
    try {
      return JSON.stringify(value, fullReplacer, space);
    } catch (err) {
      if (err.message && err.message.startsWith("Converting circular structure to JSON")) {
        return JSONUtils.safeStringify(value, fullReplacer, space);
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
    return JSONC.parse(value);
  },
  /**
   * Duplicate an object using serializer
   */
  duplicate: value => {
    return JSON.parse(JSONUtils.stringify(value));
  },
  /**
   * Helper to FileUtils.save
   */
  loadFile: (filename: string) => FileUtils.load(filename, "json"),
  /**
   * Helper to FileUtils.save
   *
   * @param object to save
   * @param filename where to save
   * @returns
   *
   * @example
   * ```ts
   * JSONUtils.saveFile({ hello: "world" }, "test.json");
   * ```
   */
  saveFile: (object: any, filename: string) => FileUtils.save(object, filename, "json"),

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
   *
   * @param object to save
   * @param filename where to save
   * @returns
   *
   * @example
   * ```ts
   * YAMLUtils.saveFile({ hello: "world" }, "test.yaml");
   * ```
   */
  saveFile: (object: any, filename: string) => FileUtils.save(object, filename, "yaml"),
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
