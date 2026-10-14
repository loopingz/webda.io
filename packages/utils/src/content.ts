import { createReadStream, createWriteStream, existsSync, promises as fsPromises } from "node:fs";
import { dirname, join } from "node:path";
import { Readable, Writable, pipeline } from "node:stream";
import { promisify } from "node:util";
import { createHash, randomBytes } from "node:crypto";
import { useLog } from "@webda/workout";
import { streamToBuffer } from "./stream.js";

const streamPipeline = promisify(pipeline);

export type ContentBody = Readable | Buffer | string;

export interface ContentPutOptions {
  /** MIME content type, defaults to lookup from key extension or application/octet-stream */
  contentType?: string;
  /** Custom key-value metadata headers */
  metadata?: Record<string, string>;
  /** Expected content length in bytes */
  contentLength?: number;
  /** Fail with ContentExistsError when the target key already exists */
  ifNotExists?: boolean;
}

export interface ContentGetOptions {
  /** Optional byte range to retrieve */
  range?: { start: number; end?: number };
}

export interface ContentInfo {
  url: string;
  size?: number;
  etag?: string;
  contentType?: string;
  metadata?: Record<string, string>;
  lastModified?: Date;
}

export interface ContentStorage {
  /** Schemes handled, without ':' e.g. ["s3"], ["gs", "gcs"], ["file"] */
  readonly schemes: string[];
  getContent(url: string, options?: ContentGetOptions): Promise<Readable>;
  putContent(url: string, body: ContentBody, options?: ContentPutOptions): Promise<ContentInfo>;
  headContent?(url: string): Promise<ContentInfo | undefined>;
  deleteContent?(url: string): Promise<void>;
}

/**
 * Thrown when content is not found
 */
export class ContentNotFoundError extends Error {
  readonly code = "CONTENT_NOT_FOUND";
  /**
   * @param message - error message
   */
  constructor(message: string = "Content not found") {
    super(message);
    this.name = "ContentNotFoundError";
  }
}

/**
 * Thrown when content already exists and ifNotExists was set
 */
export class ContentExistsError extends Error {
  readonly code = "CONTENT_EXISTS";
  /**
   * @param message - error message
   */
  constructor(message: string = "Content already exists") {
    super(message);
    this.name = "ContentExistsError";
  }
}

/**
 * Thrown when no storage provider is registered for the scheme
 */
export class ContentStorageNotFoundError extends Error {
  readonly code = "CONTENT_STORAGE_NOT_FOUND";
  /**
   * @param scheme - scheme without provider
   */
  constructor(scheme: string) {
    super(`No content storage registered for scheme: ${scheme}`);
    this.name = "ContentStorageNotFoundError";
  }
}

const COMMON_MIME_TYPES: Record<string, string> = {
  json: "application/json",
  jsonc: "application/json",
  yaml: "application/yaml",
  yml: "application/yaml",
  txt: "text/plain",
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  js: "application/javascript",
  mjs: "application/javascript",
  ts: "application/typescript",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  xml: "application/xml",
  zip: "application/zip",
  gz: "application/gzip",
  ndjson: "application/x-ndjson",
  bin: "application/octet-stream"
};

/**
 * Infer MIME type from file extension
 * @param filename - filename or path
 * @returns inferred MIME type or application/octet-stream
 */
export function lookupMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext && COMMON_MIME_TYPES[ext]) {
    return COMMON_MIME_TYPES[ext];
  }
  return "application/octet-stream";
}

/**
 * Convert any ContentBody to a Readable stream
 * @param body - Readable stream, Buffer, or string
 * @returns Readable stream
 */
export function toReadable(body: ContentBody): Readable {
  if (body instanceof Readable) {
    return body;
  }
  if (typeof body === "string") {
    return Readable.from([Buffer.from(body, "utf-8")]);
  }
  if (Buffer.isBuffer(body) || (body as any) instanceof Uint8Array) {
    return Readable.from([body]);
  }
  throw new Error("Invalid ContentBody type");
}

/**
 * Convert ContentBody to Buffer
 * @param body - Readable stream, Buffer, or string
 * @returns Promise of Buffer
 */
export async function toBuffer(body: ContentBody): Promise<Buffer> {
  if (Buffer.isBuffer(body)) {
    return body;
  }
  if (typeof body === "string") {
    return Buffer.from(body, "utf-8");
  }
  if (body instanceof Readable) {
    return streamToBuffer(body);
  }
  if ((body as any) instanceof Uint8Array) {
    const u8 = body as unknown as Uint8Array;
    return Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength);
  }
  throw new Error("Invalid ContentBody type");
}

/**
 * Parse a URL or filesystem path into scheme, bucket, and key
 * @param url - the URL or path to parse
 * @param defaultBucket - optional fallback bucket for scheme:///key or scheme:key
 * @returns parsed components
 */
export function parseContentUrl(
  url: string,
  defaultBucket?: string
): { scheme: string; bucket?: string; key: string } {
  if (!url) {
    throw new Error("URL must not be empty");
  }

  // Bare paths (e.g. /abs/path, ./rel, rel/file.txt)
  const schemeMatch = url.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):(.*)$/);
  if (!schemeMatch) {
    return { scheme: "file", bucket: undefined, key: url };
  }

  const scheme = schemeMatch[1].toLowerCase();
  const rest = schemeMatch[2];

  if (scheme === "file") {
    let path = rest;
    if (path.startsWith("//")) {
      path = path.substring(2);
    }
    try {
      path = decodeURIComponent(path);
    } catch {
      // Keep raw path on malformed encoding
    }
    return { scheme: "file", bucket: undefined, key: path };
  }

  // Object store schemes (s3, gs, gcs, memory, etc.)
  if (rest.startsWith("///")) {
    let key = rest.substring(3);
    try {
      key = decodeURIComponent(key);
    } catch {}
    return { scheme, bucket: defaultBucket, key };
  }

  if (rest.startsWith("//")) {
    const afterSlash = rest.substring(2);
    const slashIdx = afterSlash.indexOf("/");
    let bucket: string;
    let key: string;
    if (slashIdx === -1) {
      bucket = afterSlash;
      key = "";
    } else {
      bucket = afterSlash.substring(0, slashIdx);
      key = afterSlash.substring(slashIdx + 1);
    }
    try {
      key = decodeURIComponent(key);
    } catch {}
    return { scheme, bucket: bucket || defaultBucket, key };
  }

  // scheme:key
  let key = rest.replace(/^\/+/, "");
  try {
    key = decodeURIComponent(key);
  } catch {}
  return { scheme, bucket: defaultBucket, key };
}

export interface StorageRegistration {
  provider: ContentStorage;
  bucket?: string;
  default?: boolean;
}

/**
 * Registry of content storage providers
 */
export class ContentStoragesRegistry {
  private providers: StorageRegistration[] = [];

  /**
   * Register a storage provider
   * @param provider - provider instance
   * @param opts - optional bucket binding and default flag
   * @param opts.bucket - optional bucket binding
   * @param opts.default - optional default flag
   */
  register(provider: ContentStorage, opts?: { bucket?: string; default?: boolean }): void {
    if (opts?.bucket) {
      for (const scheme of provider.schemes) {
        const existing = this.providers.find(
          p => p.bucket === opts.bucket && p.provider.schemes.includes(scheme)
        );
        if (existing && existing.provider !== provider) {
          useLog("WARN", `ContentStorages: replacing provider for ${scheme}://${opts.bucket}`);
        }
      }
    }
    this.providers.push({
      provider,
      bucket: opts?.bucket,
      default: opts?.default
    });
  }

  /**
   * Unregister a storage provider
   * @param provider - provider instance
   */
  unregister(provider: ContentStorage): void {
    this.providers = this.providers.filter(p => p.provider !== provider);
  }

  /**
   * Resolve provider for a given URL
   * @param url - content URL
   * @param defaultBucket - optional fallback bucket
   * @returns resolved ContentStorage
   */
  resolve(url: string, defaultBucket?: string): ContentStorage {
    const parsed = parseContentUrl(url, defaultBucket);
    const scheme = parsed.scheme;
    const bucket = parsed.bucket;

    const matching = this.providers.filter(p => p.provider.schemes.includes(scheme));

    // 1. Bucket-bound provider
    if (bucket) {
      const bucketMatch = matching.find(p => p.bucket === bucket);
      if (bucketMatch) {
        return bucketMatch.provider;
      }
    }

    // 2. Default provider for scheme
    const defaultMatch = matching.find(p => p.default);
    if (defaultMatch) {
      return defaultMatch.provider;
    }

    // 3. First provider registered for scheme
    if (matching.length > 0) {
      return matching[0].provider;
    }

    // 4. Default file storage fallback
    if (scheme === "file") {
      return defaultFileContentStorage;
    }

    throw new ContentStorageNotFoundError(scheme);
  }

  /**
   * Clear all registered providers (for testing)
   */
  clear(): void {
    this.providers = [];
  }
}

/** Global ContentStorages registry */
export const ContentStorages = new ContentStoragesRegistry();

/**
 * Local filesystem ContentStorage implementation
 */
export class FileContentStorage implements ContentStorage {
  readonly schemes = ["file"];

  /**
   * Get content read stream
   * @param url - file URL or path
   * @param options - range options
   * @returns Readable stream
   */
  async getContent(url: string, options?: ContentGetOptions): Promise<Readable> {
    const { key } = parseContentUrl(url);
    if (!existsSync(key)) {
      throw new ContentNotFoundError(`File not found: ${key}`);
    }
    const streamOpts: any = {};
    if (options?.range) {
      streamOpts.start = options.range.start;
      if (options.range.end !== undefined) {
        streamOpts.end = options.range.end;
      }
    }
    return createReadStream(key, streamOpts);
  }

  /**
   * Get a write stream to the target path, creating parent directories if needed
   * @param url - file URL or path
   * @returns Writable stream
   */
  async getWriteStream(url: string): Promise<Writable> {
    const { key } = parseContentUrl(url);
    const dir = dirname(key);
    await fsPromises.mkdir(dir, { recursive: true });
    return createWriteStream(key);
  }

  /**
   * Put content atomically via temporary file and rename
   * @param url - file URL or path
   * @param body - content to write
   * @param options - write options
   * @returns written ContentInfo
   */
  async putContent(url: string, body: ContentBody, options?: ContentPutOptions): Promise<ContentInfo> {
    const { key } = parseContentUrl(url);
    if (options?.ifNotExists && existsSync(key)) {
      throw new ContentExistsError(`File already exists: ${key}`);
    }
    const dir = dirname(key);
    await fsPromises.mkdir(dir, { recursive: true });

    const tmpFile = join(dir, `.tmp-${Date.now()}-${randomBytes(6).toString("hex")}`);
    const readable = toReadable(body);
    const writeStream = createWriteStream(tmpFile);

    try {
      await streamPipeline(readable, writeStream);
      await fsPromises.rename(tmpFile, key);
    } catch (err) {
      try {
        if (existsSync(tmpFile)) {
          await fsPromises.unlink(tmpFile);
        }
      } catch {
        // Ignore cleanup error
      }
      throw err;
    }

    const stat = await fsPromises.stat(key);
    const contentType = options?.contentType || lookupMimeType(key);
    const etag = `"${stat.mtimeMs}-${stat.size}"`;
    return {
      url,
      size: stat.size,
      etag,
      contentType,
      lastModified: stat.mtime
    };
  }

  /**
   * Head content metadata
   * @param url - file URL or path
   * @returns ContentInfo or undefined if not found
   */
  async headContent(url: string): Promise<ContentInfo | undefined> {
    const { key } = parseContentUrl(url);
    if (!existsSync(key)) {
      return undefined;
    }
    const stat = await fsPromises.stat(key);
    return {
      url,
      size: stat.size,
      etag: `"${stat.mtimeMs}-${stat.size}"`,
      contentType: lookupMimeType(key),
      lastModified: stat.mtime
    };
  }

  /**
   * Delete file
   * @param url - file URL or path
   */
  async deleteContent(url: string): Promise<void> {
    const { key } = parseContentUrl(url);
    if (existsSync(key)) {
      await fsPromises.unlink(key);
    }
  }
}

/** Default singleton FileContentStorage */
export const defaultFileContentStorage = new FileContentStorage();

/**
 * In-memory ContentStorage implementation (useful for tests)
 */
export class MemoryContentStorage implements ContentStorage {
  readonly schemes = ["memory"];

  private items: Map<
    string,
    {
      buffer: Buffer;
      contentType: string;
      metadata?: Record<string, string>;
      lastModified: Date;
      etag: string;
    }
  > = new Map();

  /**
   * Compute in-memory key from URL
   * @param url - content URL
   * @returns storage key string
   */
  private storageKey(url: string): string {
    const { bucket, key } = parseContentUrl(url);
    return bucket ? `${bucket}/${key}` : key;
  }

  /**
   * Get content from memory
   * @param url - memory URL
   * @param options - range options
   * @returns Readable stream
   */
  async getContent(url: string, options?: ContentGetOptions): Promise<Readable> {
    const key = this.storageKey(url);
    const item = this.items.get(key);
    if (!item) {
      throw new ContentNotFoundError(`Content not found: ${url}`);
    }
    let buf = item.buffer;
    if (options?.range) {
      const start = options.range.start;
      const end = options.range.end !== undefined ? options.range.end + 1 : undefined;
      buf = buf.subarray(start, end);
    }
    return Readable.from([buf]);
  }

  /**
   * Put content into memory
   * @param url - memory URL
   * @param body - content to store
   * @param options - write options
   * @returns ContentInfo
   */
  async putContent(url: string, body: ContentBody, options?: ContentPutOptions): Promise<ContentInfo> {
    const key = this.storageKey(url);
    if (options?.ifNotExists && this.items.has(key)) {
      throw new ContentExistsError(`Content already exists: ${url}`);
    }
    const buf = await toBuffer(body);
    const etag = `"${createHash("md5").update(buf).digest("hex")}"`;
    const contentType = options?.contentType || lookupMimeType(key);
    const lastModified = new Date();

    this.items.set(key, {
      buffer: buf,
      contentType,
      metadata: options?.metadata ? { ...options.metadata } : undefined,
      lastModified,
      etag
    });

    return {
      url,
      size: buf.length,
      etag,
      contentType,
      metadata: options?.metadata ? { ...options.metadata } : undefined,
      lastModified
    };
  }

  /**
   * Head content metadata
   * @param url - memory URL
   * @returns ContentInfo or undefined if not found
   */
  async headContent(url: string): Promise<ContentInfo | undefined> {
    const key = this.storageKey(url);
    const item = this.items.get(key);
    if (!item) {
      return undefined;
    }
    return {
      url,
      size: item.buffer.length,
      etag: item.etag,
      contentType: item.contentType,
      metadata: item.metadata ? { ...item.metadata } : undefined,
      lastModified: item.lastModified
    };
  }

  /**
   * Delete content
   * @param url - memory URL
   */
  async deleteContent(url: string): Promise<void> {
    const key = this.storageKey(url);
    this.items.delete(key);
  }

  /**
   * Clear all stored items
   */
  clear(): void {
    this.items.clear();
  }
}

/**
 * Free function: read content from URL
 * @param url - content URL
 * @param options - read options
 * @returns Readable stream
 */
export async function getContent(url: string, options?: ContentGetOptions): Promise<Readable> {
  const storage = ContentStorages.resolve(url);
  return storage.getContent(url, options);
}

/**
 * Free function: write content to URL
 * @param url - content URL
 * @param body - content body
 * @param options - write options
 * @returns written ContentInfo
 */
export async function putContent(
  url: string,
  body: ContentBody,
  options?: ContentPutOptions
): Promise<ContentInfo> {
  const storage = ContentStorages.resolve(url);
  return storage.putContent(url, body, options);
}
