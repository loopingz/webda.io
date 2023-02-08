import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, writeFileSync, createReadStream, createWriteStream } from "fs";
import * as jsonc from "jsonc-parser";
import { join } from "path";
import * as yaml from "yaml";
import { Readable, Writable } from "stream";

/**
 * Define a Finder that can be use
 */
export interface StorageFinder {
  /**
   * Recursively browse the path and call processor on each
   */
    find(path: string, processor: (filepath: string) => void, options?: {followSymlinks?: boolean}): void;
    /**
     * Get a write stream based on the id return by the finder
     */
    getWriteStream(path: string) : Writable;
     /**
     * Get a read stream based on the id return by the finder
     */
    getReadStream(path: string) : Readable;
}
/**
 * Allow save/load of yaml or json file
 */
export const FileUtils : StorageFinder & {save: (object: any, filename: string, publicAudience?: boolean) => void, load: (filename: string) => any} = {
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
   * Recursively run a process
   *
   * @param path
   * @param processor
   */
  find: (path: string, processor: (filepath: string) => void, options: {followSymlinks?: boolean} = {}): void => {
    let files = readdirSync(path);
    const fileItemCallback = (p) => {
      const stat = lstatSync(p);
      if (stat.isDirectory()) {
        FileUtils.find(p, processor, options)
      } else if (stat.isSymbolicLink()) {
        const newpath = realpathSync(p);
        fileItemCallback(newpath);
      } else if (stat.isFile()) {
        processor(p);
      }
    }
    files
      .map(f => join(path, f))
      .forEach(fileItemCallback);
  },
  /**
   * Load a YAML or JSON file based on its extension
   *
   * @param filename to load
   * @returns
   */
  load: filename => {
    if (!existsSync(filename)) {
      throw new Error(`File '${filename}' does not exist.`);
    }
    let content = readFileSync(filename, "utf-8");
    if (filename.match(/\.ya?ml$/i)) {
      let res = yaml.parseAllDocuments(content);
      if (res.length === 1) {
        return res.pop().toJSON();
      }
      return res.map(d => d.toJSON());
    } else if (filename.match(/\.jsonc?$/i)) {
      if (filename.endsWith("c")) {
        return jsonc.parse(content);
      }
      return JSON.parse(content);
    }
    throw new Error("Unknown format");
  },
  /**
   * Save a YAML or JSON file based on its extension
   *
   * @param object to serialize
   * @param filename to save
   * @returns
   */
  save: (object, filename = "", publicAudience: boolean = false) => {
    if (filename.match(/\.ya?ml$/i)) {
      return writeFileSync(
        filename,
        yaml.stringify(JSON.parse(JSONUtils.stringify(object, undefined, 0, publicAudience)))
      );
    } else if (filename.match(/\.json$/i)) {
      return writeFileSync(filename, JSONUtils.stringify(object, undefined, 2, publicAudience));
    }
    throw new Error("Unknown format");
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
  loadFile: FileUtils.load,
  /**
   * Helper to FileUtils.save
   */
  saveFile: FileUtils.save
};

/**
 * Expose basic YAML function
 */
export const YAMLUtils = {
  /**
   * Helper to FileUtils.save
   */
  saveFile: FileUtils.save,
  /**
   * Helper to FileUtils.load
   */
  loadFile: FileUtils.load,
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
