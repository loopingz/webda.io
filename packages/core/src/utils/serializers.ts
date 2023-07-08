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
import { Readable, Writable } from "stream";
import * as yaml from "yaml";
import { Core } from "../core";

type WalkerOptionsType = { followSymlinks?: boolean; includeDir?: boolean; maxDepth?: number };
type FinderOptionsType = WalkerOptionsType & { filterPattern?: RegExp; processor?: (filepath: string) => void };

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
  walk(
    path: string,
    processor: (filepath: string) => void,
    options?: WalkerOptionsType,
    state?: { depth: number }
  ): void;
  /**
   * Find
   */
  find(currentPath: string, options?: FinderOptionsType): string[];
  /**
   * Get a write stream based on the id return by the finder
   */
  getWriteStream(path: string): Writable;
  /**
   * Get a read stream based on the id return by the finder
   */
  getReadStream(path: string): Readable;
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
} = {
  /**
   * @override
   */
  getWriteStream: (path: string) => {
    return createWriteStream(path);
  },

  getReadStream: (path: string) => {
    return createReadStream(path);
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
  walk: (
    path: string,
    processor: (filepath: string) => void,
    options: WalkerOptionsType = { maxDepth: 100 },
    state: { depth: number } = { depth: 0 }
  ): void => {
    state.depth++;
    let files = readdirSync(path);
    const fileItemCallback = p => {
      try {
        const stat = lstatSync(p);
        if (stat.isDirectory()) {
          if (options.includeDir) {
            processor(p);
          }
          // folder found, trying to dig further
          if (!options.maxDepth || state.depth < options.maxDepth) {
            // unless we reached the maximum depth
            FileUtils.walk(p, processor, options, state);
          }
        } else if (stat.isSymbolicLink()) {
          const realPath = realpathSync(p);
          const stat = lstatSync(realPath);
          if (stat.isDirectory()) {
            // symlink targets a folder
            if (options.followSymlinks) {
              // following below
              if (!options.maxDepth || state.depth < options.maxDepth) {
                // unless we reached the maximum depth
                FileUtils.walk(p, processor, options, state);
              }
            }
          } else {
            // symlink targets a file
            processor(realPath);
          }
        } else if (stat.isFile()) {
          processor(p);
        }
        /* c8 ignore start */
      } catch (err) {
        Core.get()?.log("ERROR", "FileUtils.find: Error while reading file", p, err);
      }
      /* c8 ignore stop */
    };
    files.map(f => join(path, f)).forEach(fileItemCallback);
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
  find: (currentPath: string, options: FinderOptionsType = { maxDepth: 3 }): string[] => {
    let found = [];
    const processor = (filepath: string) => {
      if (!options.filterPattern || options.filterPattern.test(filepath)) {
        // unless an existing regexp filter forces to skip
        found.push(filepath);
      }
    };
    FileUtils.walk(currentPath, processor, options);
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
    let content = readFileSync(filename, "utf-8");
    format ??= getFormatFromFilename(filename);
    if (format === "yaml") {
      let res = yaml.parseAllDocuments(content);
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
    format ??= getFormatFromFilename(filename);
    if (format === "yaml") {
      return writeFileSync(
        filename,
        yaml.stringify(JSON.parse(JSONUtils.stringify(object, undefined, 0, publicAudience)))
      );
    } else if (format === "json") {
      return writeFileSync(filename, JSONUtils.stringify(object, undefined, 2, publicAudience));
    }
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
    let stringified = [];
    return JSON.stringify(
      value,
      function (key: string, val: any): any {
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
   * Helper to FileUtils.save
   */
  loadFile: (filename: string) => FileUtils.load(filename, "json"),
  /**
   * Helper to FileUtils.save
   */
  saveFile: (object: any, filename: string, publicAudience?: boolean) => FileUtils.save(object, filename, publicAudience, "json"),
  

  /**
   * Sort object keys
   * @param unordered
   * @returns
   */
  sortObject: (unordered: any, transformer: (obj: any) => any = a => a): any => {
    return Object.keys(unordered)
      .sort()
      .reduce((obj, key) => {
        let res = transformer(unordered[key]);
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
  saveFile: (object: any, filename: string, publicAudience?: boolean) => FileUtils.save(object, filename, publicAudience, "yaml"),
  /**
   * Duplicate an object using serializer
   */
  duplicate: JSONUtils.duplicate,
  /**
   * Parse a single document yaml
   *
   * @param value to parse
   * @returns object parsed
   */
  parse: value => {
    return yaml.parse(value);
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
