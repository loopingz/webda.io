import * as crypto from "crypto";
import * as fs from "fs";
import * as mime from "mime-types";
import * as path from "path";
import { Readable } from "stream";
import * as WebdaError from "../errors/errors.js";
import { Service } from "./service.js";
import { NotEnumerable } from "@webda/tsc-esm";
import { useCore, useModelMetadata } from "../core/hooks.js";
import { ServiceParameters } from "./serviceparameters.js";
import { Counter } from "../metrics/metrics.js";
import { IOperationContext } from "../contexts/icontext.js";
import { IStore } from "../core/icore.js";
import { MappingService } from "../stores/istore.js";
import { type Model, type Storable, WEBDA_STORAGE } from "@webda/models";
import { streamToBuffer, FileSize } from "@webda/utils";
import { Action } from "../models/decorator.js";
import { useContext } from "../contexts/execution.js";
import type { OperationContext } from "../contexts/operationcontext.js";
import { WebContext } from "../contexts/webcontext.js";

/**
 * Represent basic EventBinary
 */
export interface EventBinary {
  object: BinaryFileInfo;
  service: BinaryService;
}

export interface EventBinaryUploadSuccess<T extends Storable = Storable> extends EventBinary {
  target: T;
}

/**
 * Sent before metadata are updated to allow alteration of the modification
 */
export interface EventBinaryMetadataUpdate<T extends Storable = Storable> extends EventBinaryUploadSuccess<T> {
  target: T;
  metadata: BinaryMetadata;
}

/**
 * Emitted if binary does not exist
 */
export class BinaryNotFoundError extends WebdaError.CodeError {
  /** Create a new BinaryNotFoundError
   * @param hash - the binary hash
   * @param storeName - the binary service name
   */
  constructor(hash: string, storeName: string) {
    super("BINARY_NOTFOUND", `Binary not found ${hash} BinaryService(${storeName})`);
  }
}

export interface BinaryFileInfo<T extends object = {}> {
  /**
   * Hash of the binary
   */
  hash?: string;
  /**
   * Will be computed by the service
   *
   * hash of the content prefixed by 'WEBDA'
   */
  challenge?: string;
  /**
   * Size of the file
   */
  size: number;
  /**
   * Name of the file
   */
  name: string;
  /**
   * Mimetype
   */
  mimetype: string;
  /**
   * Metadatas stored along with the binary
   */
  metadata?: T;
}

/**
 * Represent files attached to a model
 */
export type BinaryFiles<T extends object = {}> = BinaryFileInfo<T>[];

/**
 * Represent a file to store
 * @WebdaSchema
 */
export abstract class BinaryFile<T extends object = {}> implements BinaryFileInfo<T> {
  /**
   * Current name
   */
  name: string;
  /**
   * Original name
   */
  originalname?: string;
  /**
   * Size of the binary
   */
  size: number;
  /**
   * Mimetype of the binary
   */
  mimetype: string;
  /**
   * Will be computed by the service
   *
   * hash of the content prefixed by 'WEBDA'
   */
  challenge?: string;
  /**
   * Will be computed by the service
   *
   * hash of the content
   */
  hash?: string;
  /**
   * Metadatas stored along with the binary
   */
  metadata?: T;

  /** Create a new BinaryFile
   * @param info - the binary file information
   */
  constructor(info: BinaryFileInfo<T>) {
    this.set(info);
  }

  /**
   * Set the information
   * @param info - the information object
   */
  set(info: BinaryFileInfo<T>) {
    this.name = info.name;
    this.challenge = info.challenge;
    this.hash = info.hash;
    this.mimetype = info.mimetype || "application/octet-stream";
    this.metadata = info.metadata || ({} as T);
    this.size = info.size;
  }

  /**
   * Retrieve a plain BinaryFileInfo object
   * @returns the result
   */
  toBinaryFileInfo(): BinaryFileInfo<T> {
    return {
      hash: this.hash,
      size: this.size,
      mimetype: this.mimetype,
      metadata: this.metadata,
      challenge: this.challenge,
      // Fallback on original name
      name: this.name || this.originalname
    };
  }

  abstract get(): Promise<Readable>;

  /**
   * Create hashes
   * @param buffer - the buffer
   * @returns the result
   */
  public async getHashes(): Promise<{ hash: string; challenge: string }> {
    if (!this.hash) {
      // Using MD5 as S3 content verification use md5
      const hash = crypto.createHash("md5");
      const challenge = crypto.createHash("md5");
      const stream = await this.get();
      challenge.update("WEBDA");
      await new Promise<void>((resolve, reject) => {
        stream.on("error", err => reject(err));
        stream.on("end", () => {
          this.hash = hash.digest("hex");
          this.challenge = challenge.digest("hex");
          resolve();
        });
        stream.on("data", chunk => {
          const buffer = Buffer.from(chunk);
          hash.update(buffer as crypto.BinaryLike);
          challenge.update(buffer as crypto.BinaryLike);
        });
      });
    }
    return {
      hash: this.hash,
      challenge: this.challenge
    };
  }
}

/** BinaryFile backed by a local filesystem path */
export class LocalBinaryFile extends BinaryFile {
  /**
   * Path on the hard drive
   */
  path: string;

  /** Create a new LocalBinaryFile
   * @param filePath - path to the local file
   */
  constructor(filePath: string) {
    super({
      name: path.basename(filePath),
      size: fs.statSync(filePath).size,
      mimetype: mime.lookup(filePath) || "application/octet-stream"
    });
    this.path = filePath;
  }

  /**
   * @override
   */
  async get(): Promise<Readable> {
    return fs.createReadStream(this.path);
  }
}

/** BinaryFile backed by an in-memory Buffer */
export class MemoryBinaryFile extends BinaryFile {
  /**
   * Content
   */
  @NotEnumerable
  buffer: Buffer;

  /** Create a new MemoryBinaryFile
   * @param buffer - the binary content
   * @param info - optional file information
   */
  constructor(buffer: Buffer | string, info: Partial<BinaryFileInfo> = {}) {
    super({
      ...info,
      size: info.size || buffer.length,
      name: info.name || "data.bin",
      mimetype: info.mimetype || "application/octet-stream"
    });
    this.buffer = typeof buffer === "string" ? Buffer.from(buffer) : buffer;
  }

  /**
   * @override
   */
  async get(): Promise<Readable> {
    return Readable.from(this.buffer);
  }
}

/**
 * Define the metadata for a Binary
 */
export type BinaryMetadata = any;

/**
 * This is a map used to retrieve binary
 *
 * @class BinaryMap
 */
export class BinaryMap<T extends object = {}> extends BinaryFile<T> {
  /**
   * Link to the binary store
   */
  [WEBDA_STORAGE]: {
    service: BinaryService;
  } = {} as any;

  /** Create a new BinaryMap
   * @param service - the binary service
   * @param obj - the binary file information
   */
  constructor(service: BinaryService, obj: BinaryFileInfo<T>) {
    super(obj);
    this.set(obj);
    this[WEBDA_STORAGE].service = service;
  }

  /**
   * Get the binary data
   *
   * @returns the result
   */
  get(): Promise<Readable> {
    return this[WEBDA_STORAGE].service.get(this);
  }

  /**
   * Get into a buffer
   * @returns the result
   */
  async getAsBuffer(): Promise<Buffer> {
    return BinaryService.streamToBuffer(await this.get());
  }

  /**
   * Download the binary to a path
   *
   * Shortcut to call {@link Binary.downloadTo} with current object
   *
   * @param filename - the filename
   * @returns the result
   */
  async downloadTo(filename: string): Promise<void> {
    return this[WEBDA_STORAGE].service.downloadTo(this, filename);
  }
}

/**
 * One Binary instance — single-cardinality binary attribute on a CoreModel.
 *
 * Tagged as a Behavior so the compiler picks it up via the same path as every
 * other `@WebdaBehavior` class. Its `@Action`-decorated methods are exposed
 * as model-scoped operations (`<Model>.<Attribute>.<Action>`) and routed by
 * `RESTOperationsTransport.exposeBehaviorRoutes`.
 *
 * Constructor takes no required arguments because the transformer-emitted
 * `__hydrateBehaviors` calls `new Binary()` with zero args before stamping
 * the parent reference into `WEBDA_STORAGE["__parent__"]`. Legacy 2-arg
 * usage (`new Binary(attribute, model)`) is still supported for direct
 * callers and tests; when present, the constructor eagerly resolves the
 * service and copies the existing model attribute value so callers can call
 * `isEmpty()` and `hash`/`size` immediately.
 *
 * @readOnly
 * @WebdaBehavior Webda/Binary
 */
export class Binary<T extends object = {}> extends BinaryMap<T> {
  /**
   * No-op: Binary cannot be constructed from DTO. The `data: never`
   * signature is the type-checked signal to the schema generator that
   * this attribute MUST be excluded from the model's Input schema.
   * @param data - the data to process
   */
  static fromDto(data: never): void {}

  // NOTE: do NOT redeclare `[WEBDA_STORAGE]` as a field here — class field
  // initializers in the subclass run AFTER `super()` returns and OVERWRITE
  // whatever BinaryMap (and BinaryFile before it) stored. We rely on the
  // inherited `[WEBDA_STORAGE]: { service: BinaryService } = {}` from
  // BinaryMap and stash the Behavior-specific keys (`empty`, `__parent__`)
  // through a typed cast at the assignment site.

  /** Create a new Binary.
   *
   * Callable with no arguments (the Behavior-hydration path the transformer
   * emits) or with the legacy `(attribute, model)` pair for direct
   * instantiation in tests / non-hydrated code.
   * @param attribute - the model attribute name (legacy form)
   * @param model - the parent model (legacy form)
   */
  constructor(attribute?: string, model?: Model) {
    if (attribute !== undefined && model !== undefined) {
      // Legacy eager wiring: resolve the service and load existing data so
      // callers can `isEmpty()` / `.hash` / `.size` right after construction.
      super(<any>useCore().getBinaryStore(model, attribute), model[attribute] || {});
      (this[WEBDA_STORAGE] as any).empty = model[attribute] === undefined;
      (this[WEBDA_STORAGE] as any)["__parent__"] = { instance: model, attribute };
    } else {
      // Behavior-hydration path: no args. The transformer's
      // `__hydrateBehaviors` stamps `__parent__` into WEBDA_STORAGE after
      // construction, so we leave service/parent unresolved and the public
      // API resolves them lazily via `getService()` and `this.parent`.
      super(undefined as any, {} as any);
      (this[WEBDA_STORAGE] as any).empty = true;
    }
  }

  /**
   * Resolve the BinaryService lazily via the Behavior parent reference.
   *
   * The transformer-emitted `__hydrateBehaviors` writes
   * `WEBDA_STORAGE["__parent__"]` after construction, and the per-Behavior
   * `parent` getter (also emitted by the transformer) surfaces it as
   * `this.parent`. We resolve the service on first call and cache it on the
   * storage slot so subsequent calls don't re-walk the binary registry.
   *
   * @returns the BinaryService that owns this Binary's parent attribute
   */
  protected getService(): BinaryService {
    if (!this[WEBDA_STORAGE].service) {
      const parent = this.getParent();
      if (!parent) {
        throw new Error("Binary parent not yet wired — cannot resolve BinaryService");
      }
      this[WEBDA_STORAGE].service = useCore().getBinaryStore(parent.instance as any, parent.attribute) as BinaryService;
    }
    return this[WEBDA_STORAGE].service;
  }

  /**
   * Read the Behavior parent reference. The transformer-emitted `parent`
   * getter on `@WebdaBehavior` classes returns the same slot, but Binary
   * may also be used in code paths where the transformer hasn't run (e.g.
   * unit tests that hand-roll instances), so we read the slot directly.
   *
   * @returns the parent reference or undefined
   */
  protected getParent(): { instance: Storable; attribute: string } | undefined {
    return (this[WEBDA_STORAGE] as any)["__parent__"];
  }

  /**
   * isEmpty
   * @returns the result
   */
  isEmpty() {
    return (this[WEBDA_STORAGE] as any).empty;
  }

  /**
   * Ensure empty is set correctly
   * @param info - the information object
   */
  set(info: BinaryFileInfo<T>): void {
    super.set(info);
    (this[WEBDA_STORAGE] as any).empty = false;
  }

  /**
   * Replace the binary by uploading a new file. Direct programmatic use
   * (non-HTTP). Equivalent to the `attach(...)` HTTP action minus the
   * context handling.
   * @param file - the binary file to upload
   * @returns the result
   */
  async upload(file: BinaryFile<T>): Promise<void> {
    const parent = this.getParent();
    if (!parent) {
      throw new Error("Binary parent not yet wired — cannot upload");
    }
    await this.getService().store(parent.instance, parent.attribute, file);
    this.set(file);
  }

  /**
   * Delete this binary from storage and clear local state.
   *
   * Exposed as a Behavior `@Action` (DELETE on `{uuid}/<attribute>/{hash}`).
   * The URL `{hash}` must match the current binary's hash; this guards
   * against accidental deletes when the client raced a metadata update.
   *
   * Migrated from `DomainService.binaryAction` (action="delete",
   * single-cardinality branch).
   * @param hash - the URL-supplied hash; must match `this.hash`
   */
  @Action({ rest: { route: "{hash}", method: "DELETE" } })
  async delete(hash: string): Promise<void> {
    const parent = this.getParent();
    if (!parent) {
      throw new Error("Binary parent not yet wired — cannot delete");
    }
    if (!this.hash || this.hash !== hash) {
      throw new WebdaError.BadRequest("Hash does not match");
    }
    await this.getService().delete(parent.instance, parent.attribute);
    this.set(<any>{});
    (this[WEBDA_STORAGE] as any).empty = true;
  }

  /**
   * Direct (multipart / raw) upload from an HTTP request.
   *
   * `POST /<plural>/{uuid}/<attribute>` — accepts the binary content as the
   * request body, hashes it, stores it on the BinaryService, and updates
   * this Binary's metadata. Returns early if the new content's hash matches
   * what we already hold (idempotent on duplicate uploads).
   *
   * Migrated from `DomainService.binaryPut`; the parent-loading step is
   * unnecessary here because the Behavior is already attached to its parent
   * by `__hydrateBehaviors`.
   */
  @Action({ rest: { route: ".", method: "POST" } })
  async attach(): Promise<void> {
    const context = useContext<OperationContext>();
    const parent = this.getParent();
    if (!parent) {
      throw new Error("Binary parent not yet wired — cannot attach");
    }
    const service = this.getService();
    const file = await service.getFile(context);
    const { hash } = await file.getHashes();
    if (this.hash === hash) {
      return; // already linked — idempotent
    }
    await service.store(parent.instance, parent.attribute, file);
    this.set(file as unknown as BinaryFileInfo<T>);
  }

  /**
   * Challenge-based upload handshake.
   *
   * `PUT /<plural>/{uuid}/<attribute>` — the client sends `{ hash, challenge,
   * size?, name?, mimetype?, metadata? }`; we ask the BinaryService for a
   * pre-signed upload URL (or a "done" flag if dedup matched) and return it.
   *
   * Migrated from `DomainService.binaryChallenge`.
   * @param body - the challenge body forwarded by `resolveArguments`; falls
   *   back to `context.getInput()` when undefined.
   * @returns `{ url?, method?, headers?, done, md5 }`
   */
  @Action({ rest: { route: ".", method: "PUT" } })
  async attachChallenge(body?: BinaryFileInfo & { hash: string; challenge: string }): Promise<any> {
    const context = useContext<OperationContext>();
    const parent = this.getParent();
    if (!parent) {
      throw new Error("Binary parent not yet wired — cannot attachChallenge");
    }
    const service = this.getService();
    if (body === undefined) {
      body = await context.getInput();
    }
    if (this.hash === body.hash) {
      return; // already linked
    }
    const url = await service.putRedirectUrl(parent.instance, parent.attribute, body, context);
    const md5 = Buffer.from(body.hash, "hex").toString("base64");
    return {
      ...url,
      done: url === undefined,
      md5
    };
  }

  /**
   * Stream the binary to the response, or 302-redirect to a signed URL.
   *
   * `GET /<plural>/{uuid}/<attribute>` — if the underlying BinaryService
   * supports redirect URLs (e.g. S3) we 302 to the signed URL; otherwise we
   * pipe the bytes directly through the response.
   *
   * Named `download` (not `get`) so the parent `BinaryMap.get(): Readable`
   * accessor isn't shadowed — Behavior @Action methods can't change the
   * parent type's contract, and a plain `get()` overload that returns
   * `void` would break callers that consume the Readable.
   *
   * Migrated from `DomainService.binaryGet` (single-cardinality branch).
   */
  @Action({ rest: { route: ".", method: "GET" } })
  async download(): Promise<void> {
    const context = useContext<OperationContext>();
    const service = this.getService();
    if (!this.hash) {
      throw new WebdaError.NotFound("Object does not exist or attachment does not exist");
    }
    const url = await service.getRedirectUrlFromObject(this as unknown as BinaryMap, context);
    if (url === null) {
      // No redirect — stream directly through the response.
      context.writeHead(200, {
        "Content-Type": this.mimetype === undefined ? "application/octet-stream" : this.mimetype,
        "Content-Length": this.size
      });
      const readStream: any = await service.get(this as unknown as BinaryMap);
      await new Promise<void>((resolve, reject) => {
        (context as any)._stream.on("finish", resolve);
        (context as any)._stream.on("error", reject);
        readStream.pipe((context as any)._stream);
      });
    } else {
      context.writeHead(302, { Location: url });
    }
  }

  /**
   * Return a JSON `{ Location, Map }` describing where to fetch the binary.
   *
   * `GET /<plural>/{uuid}/<attribute>/url` — variant of `download()` that
   * returns the URL as JSON instead of redirecting. Used by clients that
   * want to discover the URL without following the redirect.
   *
   * Migrated from `DomainService.binaryGet`'s `returnUrl` branch.
   * @returns `{ Location, Map }`
   */
  @Action({ rest: { route: "url", method: "GET" } })
  async downloadUrl(): Promise<{ Location: string | undefined; Map: BinaryMap<T> }> {
    const context = useContext<OperationContext>();
    const service = this.getService();
    if (!this.hash) {
      throw new WebdaError.NotFound("Object does not exist or attachment does not exist");
    }
    const url = await service.getRedirectUrlFromObject(this as unknown as BinaryMap, context);
    if (url === null) {
      // No service-level signed URL: fall back to the same URL minus `/url`.
      if (context instanceof WebContext) {
        return {
          Location: context
            .getHttpContext()
            .getAbsoluteUrl()
            .replace(/\/url$/, ""),
          Map: this as unknown as BinaryMap<T>
        };
      }
      return { Location: undefined, Map: this as unknown as BinaryMap<T> };
    }
    return { Location: url, Map: this as unknown as BinaryMap<T> };
  }

  /**
   * Update the metadata sidecar attached to this binary.
   *
   * `PUT /<plural>/{uuid}/<attribute>/{hash}` — verifies the URL `{hash}`
   * matches the current binary, applies the new metadata, and persists via
   * `parent.instance.patch(...)`. Metadata payload is capped at 4 KB to
   * mirror the existing `DomainService.binaryAction` rule.
   *
   * Migrated from `DomainService.binaryAction` (action="metadata" branch).
   * @param hash - the URL-supplied hash; must match `this.hash`
   * @param metadata - the new metadata blob (≤ 4 KB JSON)
   */
  @Action({ rest: { route: "{hash}", method: "PUT" } })
  async setMetadata(hash: string, metadata: T): Promise<void> {
    const context = useContext<OperationContext>();
    const parent = this.getParent();
    if (!parent) {
      throw new Error("Binary parent not yet wired — cannot setMetadata");
    }
    if (this.hash !== hash) {
      throw new WebdaError.BadRequest("Hash does not match");
    }
    if (metadata === undefined) {
      metadata = await context.getInput();
    }
    if (JSON.stringify(metadata).length >= 4096) {
      throw new WebdaError.BadRequest("Metadata is too big: 4kb max");
    }
    this.metadata = metadata;
    await (parent.instance as any).patch({
      [parent.attribute]: this
    });
  }

  /**
   * Return undefined at runtime if no hash; the type annotation deliberately
   * narrows to the populated shape so the schema generator follows
   * `BinaryFileInfo<T>` for the Output/Stored schemas.
   * @returns the result
   */
  toJSON(): BinaryFileInfo<T> {
    if (!this.hash) {
      return undefined as unknown as BinaryFileInfo<T>;
    }
    return this;
  }
}

/**
 * Define a Binary map stored in a Binaries collection
 */
export class BinariesItem<T extends object = {}> extends BinaryMap<T> {
  [WEBDA_STORAGE]: {
    service: BinaryService;
    parent: BinariesImpl<T>;
  } = {} as any;

  /** Create a new BinariesItem
   * @param parent - the parent binaries collection
   * @param info - the binary file information
   */
  constructor(parent: BinariesImpl<T>, info: BinaryFileInfo<T>) {
    super(parent[WEBDA_STORAGE].service, info);
    this[WEBDA_STORAGE].parent = parent;
  }
  /**
   * Replace the binary
   * @param id - the identifier
   * @param ctx - the operation context
   * @param file - the file path
   * @returns the result
   */
  async upload(file: BinaryFile<T>): Promise<void> {
    await this[WEBDA_STORAGE].parent.upload(file, this);
    this.set(file);
  }

  /**
   * Delete the binary, if you need to replace just use upload
   * @returns the result
   */
  async delete() {
    return this[WEBDA_STORAGE].parent.delete(this);
  }
}
/**
 * Define a collection of Binary — many-cardinality binary attribute.
 *
 * Tagged as a Behavior so its `@Action` methods register as
 * `<Model>.<Attribute>.<Action>` operations alongside Single-Binary ones.
 * Inherits from `Array<BinariesItem<T>>` so it preserves array semantics
 * (iteration, indexed access, JSON.stringify-as-array). The transformer
 * detects this Array-subclass shape and emits a push-based hydration
 * coercion — see `behaviors.ts:createHydrationBlock`.
 *
 * @WebdaBehavior Webda/BinariesImpl
 */
export class BinariesImpl<T extends object = {}> extends Array<BinariesItem<T>> {
  protected [WEBDA_STORAGE]: {
    service?: BinaryService;
    [key: string]: any;
  } = {} as any;

  /**
   * No-op: BinariesImpl cannot be constructed from DTO
   * @param data - the data to process
   */
  static fromDto(data: never): void {}

  /**
   * Bind this collection to a model and attribute, populating from existing binary data.
   *
   * Legacy entry-point used by code that constructs a `BinariesImpl()`
   * directly (tests, manual instantiation). The Behavior-hydration path the
   * transformer emits writes `WEBDA_STORAGE["__parent__"]` instead and
   * never calls `assign`.
   *
   * @param model - the model to use
   * @param attribute - the attribute name
   * @returns this for chaining
   */
  assign(model: Model, attribute: string): this {
    this[WEBDA_STORAGE]["__parent__"] = { instance: model, attribute };
    for (const binary of model[attribute] || []) {
      this.push(binary);
    }
    this[WEBDA_STORAGE].service = <BinaryService>useCore().getBinaryStore(model, attribute);
    return this;
  }

  /**
   * Resolve the BinaryService lazily via the Behavior parent reference.
   *
   * Mirrors `Binary.getService()`. The transformer-emitted parent slot
   * (`WEBDA_STORAGE["__parent__"]`) is the source of truth.
   *
   * @returns the BinaryService for this collection's parent attribute
   */
  protected getService(): BinaryService {
    if (!this[WEBDA_STORAGE].service) {
      const parent = this.getParent();
      if (!parent) {
        throw new Error("Binaries parent not yet wired — cannot resolve BinaryService");
      }
      this[WEBDA_STORAGE].service = useCore().getBinaryStore(parent.instance as any, parent.attribute) as BinaryService;
    }
    return this[WEBDA_STORAGE].service;
  }

  /**
   * Read the Behavior parent reference. Mirrors `Binary.getParent()`.
   * @returns the parent reference or undefined
   */
  protected getParent(): { instance: Storable; attribute: string } | undefined {
    return (this[WEBDA_STORAGE] as any)["__parent__"];
  }

  /** @throws Readonly collection */
  pop(): BinariesItem<T> {
    throw new Error("Readonly");
  }
  /** @throws Readonly collection */
  slice(): BinariesItem<T>[] {
    throw new Error("Readonly");
  }
  /** @throws Readonly collection */
  unshift(): number {
    throw new Error("Readonly");
  }
  /** @throws Readonly collection */
  shift(): BinariesItem<T> {
    throw new Error("Readonly");
  }
  /**
   * Add binary items, wrapping plain objects in BinariesItem
   * @param args - additional arguments
   * @returns the result number
   */
  push(...args): number {
    return super.push(...args.map(arg => (arg instanceof BinariesItem ? arg : new BinariesItem(this, arg))));
  }

  /**
   * Upload a file to this model. Direct programmatic API (non-HTTP).
   * @param file - the file path
   * @param replace - whether to replace existing
   */
  async upload(file: BinaryFile<T>, replace?: BinariesItem<T>): Promise<void> {
    const parent = this.getParent();
    if (!parent) {
      throw new Error("Binaries parent not yet wired — cannot upload");
    }
    await this.getService().store(parent.instance, parent.attribute, file);
    // Should call the store first
    super.push(new BinariesItem(this, file));
    if (replace) {
      await this.delete(replace);
    }
  }

  /**
   * Delete an item by reference or index. Direct programmatic API (non-HTTP).
   * @param item - the item to delete
   */
  async delete(item: BinariesItem<T>): Promise<void> {
    const parent = this.getParent();
    if (!parent) {
      throw new Error("Binaries parent not yet wired — cannot delete");
    }
    let itemIndex = this.indexOf(item);
    if (itemIndex === -1) {
      throw new Error("Item not found");
    }
    await this.getService().delete(parent.instance, parent.attribute, itemIndex);
    itemIndex = this.indexOf(item);
    if (itemIndex >= 0) {
      // Call store delete here
      this.splice(itemIndex, 1);
    }
  }

  /**
   * Direct (multipart / raw) upload from an HTTP request. Pushes a new item
   * onto the collection.
   *
   * `POST /<plural>/{uuid}/<attribute>` — same shape as `Binary.attach` but
   * pushes the new file rather than replacing the existing one.
   * Migrated from `DomainService.binaryPut` (MANY-cardinality branch).
   */
  @Action({ rest: { route: ".", method: "POST" } })
  async attach(): Promise<void> {
    const context = useContext<OperationContext>();
    const parent = this.getParent();
    if (!parent) {
      throw new Error("Binaries parent not yet wired — cannot attach");
    }
    const service = this.getService();
    const file = await service.getFile(context);
    const { hash } = await file.getHashes();
    if (this.find(item => item.hash === hash)) {
      return; // dedup
    }
    await service.store(parent.instance, parent.attribute, file);
    super.push(new BinariesItem(this, file as unknown as BinaryFileInfo<T>));
  }

  /**
   * Challenge-based upload handshake for the next item.
   *
   * `PUT /<plural>/{uuid}/<attribute>` — request a pre-signed upload URL
   * for a new item identified by `{ hash, challenge, ... }`. Returns the
   * URL or a `done` flag if dedup matched.
   *
   * Migrated from `DomainService.binaryChallenge` (MANY-cardinality branch).
   * @param body - the challenge body; falls back to `context.getInput()`
   * @returns `{ url?, method?, headers?, done, md5 }`
   */
  @Action({ rest: { route: ".", method: "PUT" } })
  async attachChallenge(body?: BinaryFileInfo & { hash: string; challenge: string }): Promise<any> {
    const context = useContext<OperationContext>();
    const parent = this.getParent();
    if (!parent) {
      throw new Error("Binaries parent not yet wired — cannot attachChallenge");
    }
    const service = this.getService();
    if (body === undefined) {
      body = await context.getInput();
    }
    if (this.find(item => item.hash === body.hash)) {
      return; // dedup
    }
    const url = await service.putRedirectUrl(parent.instance, parent.attribute, body, context);
    const md5 = Buffer.from(body.hash, "hex").toString("base64");
    return {
      ...url,
      done: url === undefined,
      md5
    };
  }

  /**
   * Stream a single item to the response, or 302-redirect to a signed URL.
   *
   * `GET /<plural>/{uuid}/<attribute>/{index}` — locates the item by `index`
   * and behaves like `Binary.get` for that single entry.
   *
   * Migrated from `DomainService.binaryGet` (MANY-cardinality branch).
   * @param index - the item position in the collection
   */
  @Action({ rest: { route: "{index}", method: "GET" } })
  async get(index: number): Promise<void> {
    const context = useContext<OperationContext>();
    const service = this.getService();
    const idx = typeof index === "number" ? index : parseInt(index as any);
    if (this.length <= idx || idx < 0) {
      throw new WebdaError.NotFound("Object does not exist or attachment does not exist");
    }
    const file = this[idx];
    const url = await service.getRedirectUrlFromObject(file, context);
    if (url === null) {
      context.writeHead(200, {
        "Content-Type": file.mimetype === undefined ? "application/octet-stream" : file.mimetype,
        "Content-Length": file.size
      });
      const readStream: any = await service.get(file);
      await new Promise<void>((resolve, reject) => {
        (context as any)._stream.on("finish", resolve);
        (context as any)._stream.on("error", reject);
        readStream.pipe((context as any)._stream);
      });
    } else {
      context.writeHead(302, { Location: url });
    }
  }

  /**
   * Return a `{ Location, Map }` JSON for a single item.
   *
   * `GET /<plural>/{uuid}/<attribute>/{index}/url` — variant of `get` that
   * returns the URL as JSON instead of redirecting / streaming.
   *
   * Migrated from `DomainService.binaryGet`'s `returnUrl` branch
   * (MANY-cardinality).
   * @param index - the item position in the collection
   * @returns `{ Location, Map }`
   */
  @Action({ rest: { route: "{index}/url", method: "GET" } })
  async getUrl(index: number): Promise<{ Location: string | undefined; Map: BinaryMap<T> }> {
    const context = useContext<OperationContext>();
    const service = this.getService();
    const idx = typeof index === "number" ? index : parseInt(index as any);
    if (this.length <= idx || idx < 0) {
      throw new WebdaError.NotFound("Object does not exist or attachment does not exist");
    }
    const file = this[idx];
    const url = await service.getRedirectUrlFromObject(file, context);
    if (url === null) {
      if (context instanceof WebContext) {
        return {
          Location: context
            .getHttpContext()
            .getAbsoluteUrl()
            .replace(/\/url$/, ""),
          Map: file
        };
      }
      return { Location: undefined, Map: file };
    }
    return { Location: url, Map: file };
  }

  /**
   * Delete a single item by `(index, hash)`.
   *
   * `DELETE /<plural>/{uuid}/<attribute>/{index}/{hash}` — the URL `{hash}`
   * must match the item at `{index}`. Removes from storage and from the
   * in-memory collection.
   *
   * Migrated from `DomainService.binaryAction` (action="delete",
   * MANY-cardinality branch).
   * @param index - the item position
   * @param hash - the URL-supplied hash; must match `this[index].hash`
   */
  @Action({ rest: { route: "{index}/{hash}", method: "DELETE" } })
  async deleteAt(index: number, hash: string): Promise<void> {
    const parent = this.getParent();
    if (!parent) {
      throw new Error("Binaries parent not yet wired — cannot delete");
    }
    const idx = typeof index === "number" ? index : parseInt(index as any);
    const file = this[idx];
    if (!file || file.hash !== hash) {
      throw new WebdaError.BadRequest("Hash does not match");
    }
    await this.getService().delete(parent.instance, parent.attribute, idx);
    if (this[idx] && this[idx].hash === hash) {
      this.splice(idx, 1);
    }
  }

  /**
   * Update the metadata sidecar of a single item.
   *
   * `PUT /<plural>/{uuid}/<attribute>/{index}/{hash}` — verifies the hash,
   * applies the new metadata, and persists via `parent.instance.patch(...)`.
   * Metadata payload capped at 4 KB.
   *
   * Migrated from `DomainService.binaryAction` (action="metadata",
   * MANY-cardinality branch).
   * @param index - the item position
   * @param hash - the URL-supplied hash; must match `this[index].hash`
   * @param metadata - the new metadata blob (≤ 4 KB JSON)
   */
  @Action({ rest: { route: "{index}/{hash}", method: "PUT" } })
  async setMetadata(index: number, hash: string, metadata?: T): Promise<void> {
    const context = useContext<OperationContext>();
    const parent = this.getParent();
    if (!parent) {
      throw new Error("Binaries parent not yet wired — cannot setMetadata");
    }
    const idx = typeof index === "number" ? index : parseInt(index as any);
    const file = this[idx];
    if (!file || file.hash !== hash) {
      throw new WebdaError.BadRequest("Hash does not match");
    }
    if (metadata === undefined) {
      metadata = await context.getInput();
    }
    if (JSON.stringify(metadata).length >= 4096) {
      throw new WebdaError.BadRequest("Metadata is too big: 4kb max");
    }
    file.metadata = metadata;
    await (parent.instance as any).patch({
      [parent.attribute]: this
    });
  }

  /**
   * Native array serialization. The transformer adds a Behavior-style
   * `toJSON` to every Behavior class unless the author defines one;
   * we override it explicitly so JSON.stringify produces a plain array of
   * items rather than an object keyed by indices.
   * @returns the result array
   */
  toJSON(): BinariesItem<T>[] {
    return Array.from(this);
  }
}

/**
 * Type-level alias for `BinariesImpl<T>`.
 *
 * Models declare `photos: Binaries<...>` rather than the more verbose
 * `photos: BinariesImpl<...>`; the compiler resolves this alias to the
 * `BinariesImpl` class declaration, picks up the `@WebdaBehavior` JSDoc
 * tag there, and registers the attribute as a Behavior. The runtime
 * shape (push/splice/index access plus `attach`, `attachChallenge`, `get`,
 * `getUrl`, `deleteAt`, `setMetadata`, `upload`) comes from
 * `BinariesImpl` directly.
 */
export type Binaries<T extends object = {}> = BinariesImpl<T>;

/** Parameters for BinaryService, defining model mappings and max upload size */
export class BinaryParameters extends ServiceParameters {
  /**
   * max file size
   */
  protected _maxFileSize: number;
  /**
   * Define the map of models
   * * indicates all models
   *
   * key is a Store name
   * the string[] represent all valids attributes to store files in * indicates all attributes
   */
  models: { [key: /** @serviceName */ string]: /** @modelName */ string[] };

  /**
   * Define the maximum filesize to accept as direct upload
   *
   * @default 10 MB
   */
  set maxFileSize(value: number | string) {
    this._maxFileSize = new FileSize(value).valueOf();
  }
  /**
   * Get the max file size in bytes
   * @returns the result number
   */
  get maxFileSize(): number {
    return this._maxFileSize;
  }

  /**
   * Load parameters with defaults for model mappings and max file size
   * @param params - the service parameters
   * @returns this for chaining
   */
  load(params: any = {}): this {
    super.load(params);
    // Store all models in it by default
    this.models ??= {
      "*": ["*"]
    };
    this.maxFileSize = new FileSize(params.maxFileSize ?? "10 MB").valueOf();
    return this;
  }
}

export type BinaryEvents = {
  /**
   * Emitted when someone download a binary
   */
  "Binary.Get": EventBinary;
  "Binary.UploadSuccess": EventBinaryUploadSuccess;
  "Binary.MetadataUpdate": EventBinaryMetadataUpdate;
  "Binary.MetadataUpdated": EventBinaryUploadSuccess;
  "Binary.Create": EventBinaryUploadSuccess;
  "Binary.Delete": EventBinary;
};

/**
 * Define a BinaryModel with infinite field for binary map
 */
export type CoreModelWithBinary<T = { [key: string]: BinaryMap[] | BinaryMap }> = Model & T;

/**
 * This is an abstract service to represent a storage of files
 * The binary allow you to expose this service as HTTP
 *
 * It supports two modes:
 *  - attached to a CoreModel (attach, detach, reattach)
 *  - pure storage with no managed id (read, write, delete)
 *
 * As we have deduplication builtin you can get some stats
 * - getUsageCount(hash)
 * - getUsageCountForRaw()
 * - getUsageCountForMap()
 *
 * The Binary storage should store only once a binary and reference every object that are used by this binary, so it can be cleaned.
 *
 *
 * @see FileBinary
 * @see S3Binary
 *
 * @exports
 * @abstract
 * @WebdaModda Binary
 */
export abstract class BinaryService<
  T extends BinaryParameters = BinaryParameters,
  E extends BinaryEvents = BinaryEvents
>
  extends Service<T, E>
  implements MappingService<BinaryMap>
{
  _lowercaseMaps: any;

  declare metrics: {
    upload: Counter;
    download: Counter;
    delete: Counter;
    metadataUpdate: Counter;
  };

  /**
   * @override
   */
  initMetrics(): void {
    super.initMetrics();
    this.metrics.upload = this.getMetric(Counter, {
      name: "binary_upload",
      help: "Number of binary upload"
    });
    this.metrics.delete = this.getMetric(Counter, {
      name: "binary_delete",
      help: "Number of binary deleted"
    });
    this.metrics.download = this.getMetric(Counter, {
      name: "binary_download",
      help: "Number of binary upload"
    });
    this.metrics.metadataUpdate = this.getMetric(Counter, {
      name: "binary_metadata_update",
      help: "Number of binary metadata updated"
    });
  }

  /**
   * Get a UrlFromObject
   *
   * @param binaryMap - the binary map definition
   * @param _context - the execution context
   * @param _expires - the expiration time
   * @returns the result
   */
  async getRedirectUrlFromObject(
    binaryMap: BinaryMap,
    _context: IOperationContext,
    _expires: number = 30
  ): Promise<null | string> {
    return null;
  }

  /**
   * Define if binary is managed by the store
   * @param modelName - the model name
   * @param attribute - the attribute name
   * @returns -1 if not managed, 0 if managed but by default, 1 if managed and in the map, 2 if explicit with attribute and model
   */
  handleBinary(modelName: string, attribute: string): -1 | 0 | 1 | 2 {
    let key = Object.keys(this.parameters.models).find(k => k === modelName);
    if (key) {
      // Explicit model
      const attributes = this.parameters.models[key];
      if (attributes.includes(attribute)) {
        return 2;
      } else if (attributes.includes("*")) {
        return 1;
      }
    }
    // Default to all model - 593-594,598-599
    key = Object.keys(this.parameters.models).find(k => k === "*");
    if (!key) {
      return -1;
    }
    const attributes = this.parameters.models[key];
    if (attributes.includes(attribute)) {
      return 1;
    }
    if (attributes.includes("*")) {
      return 0;
    }
    return -1;
  }

  /**
   * When you store a binary to be able to retrieve it you need to store the information into another object
   *
   * If you have a User object define like this : User = {'name': 'Remi', 'uuid': 'Loopingz'}
   * You will call the `store(userStore, 'Loopingz', 'images', filedata, {'type':'profile'})`
   * After a successful call the object will look like
   * ```
   * User = {
   *  'name': 'Remi',
   *  'uuid': 'Loopingz',
   *  'images': [
   *    {'type':'profile','hash':'a12545...','size':1245,'mime':'application/octet'}
   *   ]
   * }
   * ```
   *
   *
   * @param {CoreModel} object The object uuid to get from the store
   * @param {String} property The object property to add the file to
   * @param {Object} file The file by itself
   * @param {Object} metadata to add to the binary object
   * @emits 'binaryCreate'
   */

  abstract store(object: Storable, property: string, file: BinaryFile, metadata?: BinaryMetadata): Promise<void>;

  /**
   * The store can retrieve how many time a binary has been used
   */
  abstract getUsageCount(hash: string): Promise<number>;

  /**
   * Delete a binary
   *
   * @param {CoreModel} object The object uuid to get from the store
   * @param {String} property The object property to add the file to
   * @param {Number} index The index of the file to change in the property
   * @emits 'binaryDelete'
   */
  abstract delete(object: Storable, property: string, index?: number): Promise<void>;

  /**
   * Get a binary
   *
   * @param {Object} info The reference stored in your target object
   * @emits 'binaryGet'
   * @returns the result
   */
  async get(info: BinaryMap): Promise<Readable> {
    await this.emit("Binary.Get", {
      object: info,
      service: this
    });
    this.metrics.download.inc();
    return this._get(info);
  }

  /**
   * Download a binary to a file
   *
   * @param {Object} info The reference stored in your target object
   * @param {String} filepath to save the binary to
   * @param filename - the filename
   */
  async downloadTo(info: BinaryMap, filename): Promise<void> {
    await this.emit("Binary.Get", {
      object: info,
      service: this
    });
    this.metrics.download.inc();
    const readStream: any = await this._get(info);
    const writeStream = fs.createWriteStream(filename);
    return new Promise<void>((resolve, reject) => {
      writeStream.on("finish", () => {
        return resolve();
      });
      writeStream.on("error", src => {
        try {
          fs.unlinkSync(filename);
          // Stubing the fs module in ESM seems complicated for now
          /* c8 ignore next 3 */
        } catch (err) {
          this.log("ERROR", err);
        }
        return reject(src);
      });
      readStream.pipe(writeStream);
    });
  }

  abstract _get(info: BinaryMap): Promise<Readable>;

  /**
   * Based on the raw Map init a BinaryMap
   * @param obj - the target object
   * @returns the result map
   */
  newModel(obj: any): BinaryMap {
    return new BinaryMap(this, obj);
  }

  /**
   * Read a stream to a buffer
   *
   * @param stream - the stream
   * @returns the result
   */
  static streamToBuffer(stream: Readable): Promise<Buffer> {
    // codesnippet from https://stackoverflow.com/questions/14269233/node-js-how-to-read-a-stream-into-a-buffer
    return streamToBuffer(stream);
  }

  /**
   * Check if a map is defined
   *
   * @param name - the name to use
   * @param property - the property name
   * @param object - the target object
   */
  protected checkMap(object: Model, property: string) {
    const { Identifier } = useModelMetadata(object);
    if (this.handleBinary(Identifier, property) !== -1) {
      return;
    }
    throw new Error("Unknown mapping");
  }

  /**
   * Ensure events are sent correctly after an upload and update the BinaryFileInfo in targetted object
   * @param object - the target object
   * @param property - the property name
   * @param fileInfo - the file information
   */
  async uploadSuccess(
    object: CoreModelWithBinary,
    property: string,
    fileInfo: BinaryFileInfo | { toBinaryFileInfo: () => BinaryFileInfo }
  ): Promise<void> {
    let file: BinaryFileInfo;
    // Ensure we do not have a full object
    if (fileInfo["toBinaryFileInfo"] && typeof fileInfo["toBinaryFileInfo"] === "function") {
      file = fileInfo["toBinaryFileInfo"]();
    } else {
      file = fileInfo as BinaryFileInfo;
    }
    let additionalAttr;
    if (
      (additionalAttr = Object.keys(file).filter(
        k => !["name", "size", "mimetype", "hash", "challenge", "metadata"].includes(k)
      ))
    ) {
      throw new Error(
        "Invalid file object it should be a plain BinaryFileInfo found additional properties: " +
          additionalAttr.join(",")
      );
    }
    const object_uid = <any>object.getUUID();
    // Check if the file is already in the array then skip
    if (Array.isArray(object[property]) && object[property].find(i => i.hash === file.hash)) {
      return;
    }
    // await this.emit("Binary.UploadSuccess", {
    //   object: file,
    //   service: this,
    //   target: object
    // });
    // const relations = object.Class.Metadata.Relations;
    // const cardinality = (relations.binaries || []).find(p => p.attribute === property)?.cardinality || "MANY";
    // if (cardinality === "MANY") {
    //   await (<CoreModelWithBinary<any>>object).Class.ref(object_uid).upsertItemToCollection(property, file);
    // } else {
    //   await object.patch(<any>{ [property]: file });
    // }
    // await this.emit("Binary.Create", {
    //   object: file,
    //   service: this,
    //   target: object
    // });
    this.metrics.upload.inc();
  }

  /**
   * Cascade delete the object
   *
   * @param info of the map
   * @param uuid of the object
   */
  abstract cascadeDelete(info: BinaryMap, uuid: string): Promise<void>;

  /**
   *
   * @param targetStore - the target store
   * @param object - the target object
   * @param property - the property name
   * @param index - the index
   * @returns the result
   */
  async deleteSuccess(object: CoreModelWithBinary, property: string, index?: number) {
    const info: BinaryMap = <BinaryMap>(index !== undefined ? object[property][index] : object[property]);
    // TODO: Refactor
    const relations: any = {}; //object.Class.Metadata.Relations;
    const cardinality = (relations.binaries || []).find(p => p.attribute === property)?.cardinality || "MANY";
    let update;
    if (cardinality === "MANY") {
      update = (<CoreModelWithBinary<any>>object).Class.ref(object.getUUID()).deleteItemFromCollection(
        property,
        index,
        "hash",
        info.hash
      );
    } else {
      (<Model & any>object).ref().removeAttribute(property);
    }
    await this.emit("Binary.Delete", {
      object: info,
      service: this
    });
    this.metrics.delete.inc();
    return update;
  }

  /**
   * Get file either from multipart post or raw
   * @param req - the request
   * @returns the result
   */
  async getFile(req: IOperationContext): Promise<BinaryFile> {
    const { size } = req.getParameters();
    let { mimetype, name } = req.getParameters();
    if (size > this.parameters.maxFileSize) {
      throw new WebdaError.BadRequest("File too big");
    }
    const file = await req.getRawInput(size ?? this.parameters.maxFileSize);
    mimetype ??= "application/octet-stream";
    name ??= "data.bin";
    return new MemoryBinaryFile(Buffer.from(file), {
      mimetype,
      size,
      name: name,
      hash: crypto.createHash("md5").update(file).digest("hex"),
      challenge: crypto
        .createHash("md5")
        .update("WEBDA" + file)
        .digest("hex")
    });
  }

  /**
   * Return the name of the service for OpenAPI
   * @returns the result string
   */
  protected getOperationName(): string {
    return this.name.toLowerCase() === "binary" ? "" : this.name;
  }

  /**
   * Based on the request parameter verify it match a known mapping
   * @param ctx - the operation context
   * @returns the result
   */
  protected verifyMapAndStore(ctx: IOperationContext): IStore {
    // Check for model
    if (this.handleBinary(ctx.parameter("model"), ctx.parameter("property")) === -1) {
      throw new WebdaError.NotFound("Model not managed by this store");
    }
    // TODO: Refactor
    return null; //<IStore>useCore().getModelStore(useModel(ctx.parameter("model")));
  }

  /**
   * By default no challenge is managed so throws 404
   *
   * @param args - additional arguments
   */
  async putRedirectUrl(...args: any): Promise<{ url: string; method?: string; headers?: { [key: string]: string } }> {
    // Dont handle the redirect url
    throw new WebdaError.NotFound("No redirect url");
  }
}
