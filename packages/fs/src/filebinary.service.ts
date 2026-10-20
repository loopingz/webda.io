import * as fs from "fs";
import { join, resolve, sep } from "path";
import { Readable } from "stream";
import {
  BinaryFile,
  BinaryFileInfo,
  BinaryMap,
  BinaryNotFoundError,
  CloudBinary,
  CloudBinaryParameters,
  ContentBody,
  ContentGetOptions,
  ContentInfo,
  ContentNotFoundError,
  ContentPutOptions,
  CoreModel,
  CoreModelWithBinary,
  CryptoService,
  defaultFileContentStorage,
  Inject,
  MemoryBinaryFile,
  normalizeHashes,
  OperationContext,
  parseContentUrl,
  useModel,
  useModelId,
  WebContext,
  WebdaError
} from "@webda/core";

/**
 * What an upload token attaches once the content is stored and verified: the object, its binary attribute and the
 * file information the client announced
 */
export interface UploadTarget {
  /**
   * Model identifier
   */
  model: string;
  /**
   * Object primary key
   */
  uuid: string;
  /**
   * Binary attribute
   */
  attribute: string;
  /**
   * File information announced by the challenge (name, size, mimetype, metadata)
   */
  info: Omit<BinaryFileInfo, "hash" | "challenge">;
}

/** Configuration parameters for the filesystem-backed binary storage service. */
export class FileBinaryParameters extends CloudBinaryParameters {
  /**
   * Define the folder to store objects in
   */
  folder: string;
  /**
   * Maximum size to handle
   * @default 10485760
   */
  maxSize: number;
  /**
   * URL to use for direct download
   */
  url?: string;

  /**
   * Load and normalize parameters, ensuring the folder path has a trailing slash.
   *
   * @param params - raw parameter values
   * @returns this instance for chaining
   */
  load(params: any): this {
    super.load(params);
    if (this.folder && !this.folder.endsWith("/")) {
      this.folder += "/";
    }
    this.maxSize ??= 10 * 1024 * 1024;
    // Remove trailing /
    if (this.url && this.url.endsWith("/")) {
      this.url = this.url.substring(0, this.url.length - 1);
    }
    return this;
  }
}
/**
 * FileBinary handles the storage of binary on a hard drive
 *
 * The structure used for now is
 * /folder/{hash}/data
 * /folder/{hash}/{model}_{attribute}_{uuid}   usage markers
 * /folder/{hash}/vproof_{challenge}          proof of possession, written by the service from the bytes it read
 *
 * Legacy proofs are ignored (a leaked value attaches nothing): `_{challenge}` (before 4.0.0-beta.5, the challenge
 * was sent to clients) and `proof_{challenge}` (written before every proof was computed by the service). The content
 * is uploaded once more to get a `vproof_` marker.
 *
 * It takes one parameter
 *  folder: "path"
 *
 * See Binary the general interface
 * @category CoreServices
 * @WebdaModda
 */
export class FileBinary<T extends FileBinaryParameters = FileBinaryParameters> extends CloudBinary<T> {
  readonly schemes = ["file"];
  /**
   * Used for hmac
   */
  @Inject("CryptoService")
  cryptoService: CryptoService;
  /**
   * Load parameters
   *
   * @param params - raw parameter values
   * @returns the loaded parameters
   */
  loadParameters(params: any): T {
    return <T>new FileBinaryParameters().load(params);
  }

  /**
   * Validate that url is safe and under folder
   * @param url - URL to validate
   * @returns resolved absolute path
   */
  private checkPath(url: string): string {
    const { key } = parseContentUrl(url);
    const absPath = resolve(key);
    const absFolder = resolve(this.parameters.folder);

    if (key.includes("..")) {
      const folderWithSep = absFolder.endsWith(sep) ? absFolder : absFolder + sep;
      if (!absPath.startsWith(folderWithSep) && absPath !== absFolder) {
        throw new ContentNotFoundError(`Path traversal rejected: ${url}`);
      }
    }
    return absPath;
  }

  /**
   * Helper that builds file:// URL under this.parameters.folder
   * @param key - relative key
   * @returns file:// URL
   */
  protected getContentUrl(key: string): string {
    const folder = this.parameters.folder.endsWith("/") ? this.parameters.folder : `${this.parameters.folder}/`;
    const cleanKey = key.replace(/^\/+/, "");
    return `file://${folder}${cleanKey}`;
  }

  /**
   * Get content read stream
   * @param url - content URL
   * @param options - get options
   * @returns Readable stream
   */
  async getContent(url: string, options?: ContentGetOptions): Promise<Readable> {
    const path = this.checkPath(url);
    return defaultFileContentStorage.getContent(path, options);
  }

  /**
   * Put content to filesystem
   * @param url - content URL
   * @param body - content body
   * @param options - put options
   * @returns Content info
   */
  async putContent(url: string, body: ContentBody, options?: ContentPutOptions): Promise<ContentInfo> {
    const path = this.checkPath(url);
    const res = await defaultFileContentStorage.putContent(path, body, options);
    if (this.metrics && (this.metrics as any).upload) {
      (this.metrics as any).upload.inc();
    }
    return {
      ...res,
      url
    };
  }

  /**
   * Head content metadata
   * @param url - content URL
   * @returns Content info or undefined
   */
  async headContent(url: string): Promise<ContentInfo | undefined> {
    const path = this.checkPath(url);
    const res = await defaultFileContentStorage.headContent(path);
    if (!res) return undefined;
    return {
      ...res,
      url
    };
  }

  /**
   * Delete content
   * @param url - content URL
   */
  async deleteContent(url: string): Promise<void> {
    const path = this.checkPath(url);
    await defaultFileContentStorage.deleteContent(path);
  }

  /**
   * Create the storage folder if needed
   */
  computeParameters() {
    super.computeParameters();
    if (this.parameters.folder && !this.parameters.folder.endsWith("/")) {
      this.parameters.folder += "/";
    }
    if (!fs.existsSync(this.parameters.folder)) {
      fs.mkdirSync(this.parameters.folder, { recursive: true });
    }
  }

  /**
   * Register download/upload routes if a public URL is configured.
   *
   * Routes depend on the runtime `parameters.url` + content hash, so they're
   * registered programmatically rather than via `@Route`.
   *
   * @returns this for chaining
   */
  async init(): Promise<this> {
    await super.init();
    // We do not want to expose by default
    if (this.parameters.url === undefined) {
      return this;
    }
    // Will redirect to this URL for direct download
    let url = this.parameters.url + "/download/data/{hash}{?token,content-disposition,content-type}";
    const name = this.getOperationName();
    this.addRoute(url, ["GET"], this.downloadBinaryLink, {
      put: {
        operationId: `get${name}Binary`,
        description: "Download a binary to an object after challenge",
        summary: "Download a binary",
        responses: {
          "200": {
            description: "Content of binary"
          },
          "403": {
            description: "Wrong hash"
          }
        }
      }
    });

    url = this.parameters.url + "/upload/data/{hash}{?token}";
    this.addRoute(url, ["PUT"], this.storeBinary, {
      put: {
        operationId: `put${name}Binary`,
        description: "Upload a binary to an object after challenge",
        summary: "Upload a binary",
        responses: {
          "204": {
            description: ""
          },
          "400": {
            description: "Wrong hash"
          },
          "404": {
            description: "Object does not exist or attachment does not exist"
          },
          "412": {
            description: "Provided hash does not match"
          }
        }
      }
    });
    return this;
  }

  /**
   * Download a binary with a signed download token (issued by the `download` behavior action, after the model's
   * permission check)
   *
   * @param ctx - the web context
   */
  async downloadBinaryLink(ctx: WebContext<any, any, { hash: string }>) {
    const { hash } = ctx.getParameters();
    // Verify token: it must be a download token for this hash (an upload token does not download)
    try {
      const dt = await this.cryptoService.jwtVerify(ctx.parameter("token"));
      if (dt.hash !== hash || dt.method !== "GET") {
        throw new WebdaError.Forbidden("Wrong hash");
      }
    } catch (err) {
      throw new WebdaError.Forbidden("Incorrect JWT");
    }
    ctx.writeHead(200, {
      "content-disposition": ctx.parameter("content-disposition"),
      "content-type": ctx.parameter("content-type")
    });
    const map = await this.get({ hash } as BinaryMap);
    // Fake a binary map for this case
    return new Promise<void>(async (resolve, reject) => {
      const stream = await ctx.getOutputStream();
      stream.on("error", reject).on("finish", resolve);
      map.pipe(stream);
    });
  }

  /**
   * @override
   */
  async _get(info: BinaryMap): Promise<Readable> {
    const hash = info.hash;
    if (!hash) throw new WebdaError.BadRequest("Missing binary hash");
    const url = this.getContentUrl(this._getKey(hash, "data"));
    try {
      return await this.getContent(url);
    } catch (err: any) {
      if (err instanceof ContentNotFoundError) {
        throw new BinaryNotFoundError(hash, this.getName());
      }
      throw err;
    }
  }

  /**
   * Get signed url to download an element
   *
   * @param map - the binary map
   * @param expires - expiration time in seconds
   * @param context - the web context
   * @returns the signed download URL
   */
  async getSignedUrlFromMap(map: BinaryMap, expires: number, context: WebContext): Promise<string> {
    return `${context
      .getHttpContext()
      .getAbsoluteUrl(this.parameters.url + "/download/data/" + map.hash)}?token=${await this.getToken(
      map.hash,
      "GET",
      expires
    )}&content-type=${map.mimetype}&content-disposition=attachment`;
  }

  /**
   * Get storage path for a hash
   *
   * @param hash - the content hash
   * @param postfix - optional path suffix
   * @returns the filesystem path
   */
  _getPath(hash: string | undefined, postfix?: string) {
    if (!hash) throw new WebdaError.BadRequest("Missing binary hash");
    if (postfix === undefined) {
      return this.parameters.folder + hash;
    }
    return this.parameters.folder + hash + "/" + postfix;
  }

  /**
   * Create a file if it does not already exist, using the given permission mode.
   *
   * @param filePath - path of the file to create
   * @param mode - file permission mode
   */
  _touch(filePath: string, mode = 0o600) {
    try {
      const fd = fs.openSync(filePath, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_RDWR, mode);
      fs.closeSync(fd);
    } catch (e) {
      // file existed
    }
  }

  /**
   * Get token for action
   *
   * @param hash - the content hash
   * @param method - HTTP method (PUT or GET)
   * @param expiresIn - token TTL in seconds
   * @param target - for an upload token, what to attach once the content is stored and verified
   * @returns the signed JWT token
   */
  async getToken(
    hash: string | undefined,
    method: "PUT" | "GET",
    expiresIn: number = 60,
    target?: UploadTarget
  ): Promise<string> {
    if (!hash) throw new WebdaError.BadRequest("Missing binary hash");
    return this.cryptoService.jwtSign(target ? { hash, method, target } : { hash, method }, { expiresIn });
  }

  /**
   * Get put URL
   *
   * @param ctx - the operation context
   * @param hash - the content hash (read from the input when not given)
   * @param target - what the upload attaches once the content is stored and verified
   * @returns the upload URL
   */
  async getPutUrl(ctx: OperationContext<BinaryFile> | undefined, hash?: string, target?: UploadTarget) {
    hash ??= (await ctx?.getInput())?.hash;
    const token = await this.getToken(hash, "PUT", 60, target);
    if (ctx instanceof WebContext) {
      return ctx.getHttpContext().getAbsoluteUrl(this.parameters.url + "/upload/data/" + hash + `?token=${token}`);
    }
    return this.parameters.url + "/upload/data/" + hash + `?token=${token}`;
  }

  /**
   * Make a marker name part file-safe: the model identifier carries a `/`, and a natural key is client-chosen, so
   * anything but letters, digits, `_`, `.`, `:`, `@` and `-` is replaced (a marker is a file inside the hash folder)
   * @param part - the raw value
   * @returns the safe name part
   */
  protected safeName(part: string): string {
    return `${part}`.replace(/[^A-Za-z0-9_.:@-]/g, "-");
  }

  /**
   * Usage marker of an object attribute in a hash folder: `<model>_<attribute>_<uuid>`, every part file-safe
   * @param target - the object attribute
   * @returns the marker file name
   */
  protected usageMarker(target: Pick<UploadTarget, "model" | "attribute" | "uuid">): string {
    return `${this.safeName(target.model)}_${this.safeName(target.attribute)}_${this.safeName(target.uuid)}`;
  }

  /**
   * Attach a stored binary to an object: usage marker, then the object's binary attribute
   * @param object - the model instance
   * @param target - the object attribute and the announced file information
   * @param hashes - the stored content
   * @param hashes.hash - its hash
   * @param hashes.challenge - its challenge
   */
  protected async attach(
    object: CoreModel,
    target: UploadTarget,
    hashes: { hash: string; challenge: string }
  ): Promise<void> {
    this._touch(this._getPath(hashes.hash, this.usageMarker(target)));
    await this.uploadSuccess(<any>object, target.attribute, {
      name: target.info.name,
      size: target.info.size,
      mimetype: target.info.mimetype,
      metadata: target.info.metadata,
      hash: hashes.hash,
      challenge: hashes.challenge
    });
  }

  /**
   * Challenge: the client announces `{hash, challenge, ...}`; the challenge is the md5 of "WEBDA" + the content,
   * so a matching one proves possession of an already stored binary, which is then attached without upload
   * (`undefined`). Otherwise the upload URL is returned and **nothing is attached yet**: the upload stores the
   * content, verifies it against the announced hash and attaches it then ({@link storeBinary}). A visible hash
   * alone therefore never gives access to another object's binary.
   *
   * @param object - the model instance
   * @param attribute - the binary attribute name
   * @param info - optional binary file info
   * @param context - the operation context
   * @returns the upload URL and method, or undefined when the binary is attached
   */
  async putRedirectUrl(
    object: CoreModel,
    attribute: string,
    info?: BinaryFile,
    context?: OperationContext<BinaryFile>
  ): Promise<{ url: string; method: string } | undefined> {
    info ??= await context?.getInput();
    // One folder per content: the hash and the challenge are lower-case hexadecimal
    info = normalizeHashes(info);
    if (!info?.hash) throw new WebdaError.BadRequest("Missing binary hash");
    const uuid = object.getUUID();
    if (!uuid) throw new WebdaError.BadRequest("Missing object identifier");
    const model = useModelId(object.constructor);
    if (!model) throw new WebdaError.BadRequest("Missing model identifier");
    const target: UploadTarget = {
      model,
      uuid,
      attribute,
      info: { name: info.name, size: info.size, mimetype: info.mimetype, metadata: info.metadata }
    };
    if (
      fs.existsSync(this._getPath(info.hash, "data")) &&
      info.challenge &&
      this.challenge(info.hash, info.challenge)
    ) {
      // Proof of possession: attach the stored binary
      await this.attach(object, target, { hash: info.hash, challenge: info.challenge });
      return;
    }
    if (!fs.existsSync(this._getPath(info.hash))) {
      fs.mkdirSync(this._getPath(info.hash));
    }
    return { url: await this.getPutUrl(context, info.hash, target), method: "PUT" };
  }

  /**
   * Store the binary sent with an upload token, then attach it to the object the token names
   *
   * @param ctx - the web context
   */
  async storeBinary(ctx: WebContext) {
    const body = await ctx.getHttpContext().getRawBody(this.parameters.maxSize);
    const result = await new MemoryBinaryFile(body as any, {
      mimetype: (ctx.getHttpContext().getUniqueHeader("content-type") || "application/json").split(";")[0],
      name: "",
      size: parseInt(ctx.getHttpContext().getUniqueHeader("content-length"))
    }).getHashes();
    if (ctx.parameter("hash") !== result.hash) {
      this.log("WARN", "Request hash differ", ctx.parameter("hash"), "!==", result.hash);
      throw new WebdaError.BadRequest("Request hash differ");
    }
    let dt: { hash: string; method?: string; target?: UploadTarget };
    try {
      dt = await this.cryptoService.jwtVerify(ctx.parameter("token"));
      // An upload token for this content only (a download token does not upload)
      if (dt.hash !== result.hash || dt.method !== "PUT") {
        this.log("WARN", "JWT hash differ", ctx.parameter("hash"), "!==", result.hash);
        throw new WebdaError.Forbidden("JWT hash differ");
      }
    } catch (err) {
      this.log("WARN", "Invalid JWT token");
      throw new WebdaError.Forbidden("Invalid JWT token");
    }
    if (!fs.existsSync(this._getPath(result.hash))) {
      throw new WebdaError.PreconditionFailed("No folder for hash " + result.hash);
    }
    const path = this._getPath(result.hash, "data");
    if (!fs.existsSync(path)) {
      fs.writeFileSync(path, body as any);
    }
    this._touch(this._getPath(result.hash, this.proofMarker(result.challenge)));
    if (dt.target) {
      // The content is stored and matches the announced hash: attach it to the object the challenge was made for
      let object: any;
      try {
        object = await useModel(dt.target.model).ref(dt.target.uuid).get();
      } catch {
        // Gone since the challenge
      }
      if (object && !object.isDeleted?.()) {
        await this.attach(object, dt.target, result);
      }
    }
  }

  /**
   * The upload attaches the binary ({@link storeBinary}): completing only checks it happened
   *
   * @override
   * @param object - the model owning the binary
   * @param property - the binary attribute
   * @param hash - the hash announced in the challenge
   */
  async completeUpload(object: CoreModelWithBinary, property: string, hash: string): Promise<void> {
    if (!this.isLinked(object, property, hash)) {
      throw new WebdaError.PreconditionFailed("Upload not complete");
    }
  }

  /**
   * @override
   */
  async getUsageCount(hash: string) {
    return this.usageMarkers(hash).length;
  }

  /**
   * Delete any usage marker and hash
   *
   * @param hash - the content hash to clean
   */
  async _cleanHash(hash: string): Promise<void> {
    const p = this._getPath(hash);
    if (!fs.existsSync(p)) return;
    try {
      const files = fs.readdirSync(p);
      files.forEach(file => fs.unlinkSync(join(p, file)));
      fs.rmdirSync(p);
    } catch (err) {}
  }

  /**
   * @override
   */
  async _cleanUsage(hash: string, uuid: string, attribute?: string): Promise<void> {
    const p = this._getPath(hash);
    if (!fs.existsSync(p)) return;
    // A marker ends with `_<attribute>_<uuid>` (see usageMarker)
    const key = this.safeName(uuid);
    this.usageMarkers(hash)
      .filter(f => f.endsWith(attribute ? `_${this.safeName(attribute)}_${key}` : `_${key}`))
      .forEach(f => fs.unlinkSync(this._getPath(hash, f)));
    if (this.usageMarkers(hash).length === 0) {
      await this._cleanHash(hash);
    }
  }

  /**
   * @override
   */
  async delete(object: CoreModelWithBinary, property: string, index?: number): Promise<void> {
    const maps = object[property];
    const map = Array.isArray(maps) ? (index === undefined ? undefined : maps[index]) : maps;
    if (!map?.hash) throw new WebdaError.BadRequest("Missing binary hash");
    const hash = map.hash;
    const uuid = object.getUUID();
    if (!uuid) throw new WebdaError.BadRequest("Missing object identifier");
    await this.deleteSuccess(<any>object, property, index);
    await this._cleanUsage(hash, uuid, property);
  }

  /**
   * Name of the proof marker of a challenge computed by the service (legacy `_<challenge>` and `proof_<challenge>`
   * markers are not proofs)
   * @param challenge - the server computed challenge
   * @returns the marker file name
   */
  protected proofMarker(challenge: string): string {
    return `vproof_${this.safeName(challenge)}`;
  }

  /**
   * Verify that a binary with the given hash exists and carries the proof marker of the challenge, written by the
   * service when the content was uploaded
   *
   * @param hash - the content hash
   * @param challenge - the challenge string
   * @returns true if the proof marker exists
   */
  challenge(hash: string | undefined, challenge: string | undefined) {
    if (!hash || !challenge) return false;
    const path = this._getPath(hash);
    return fs.existsSync(path) && fs.existsSync(`${path}/${this.proofMarker(challenge)}`);
  }

  /**
   * Usage markers of a hash folder: every file but the data and the proof markers (legacy `_` and `proof_` included)
   * @param hash - the content hash
   * @returns the marker names
   */
  protected usageMarkers(hash: string): string[] {
    const path = this._getPath(hash);
    if (!fs.existsSync(path)) {
      return [];
    }
    return fs
      .readdirSync(path)
      .filter(f => f !== "data" && !f.startsWith("_") && !f.startsWith("proof_") && !f.startsWith("vproof_"));
  }

  /**
   * @override
   */
  async cascadeDelete(info: BinaryMap, uuid: string) {
    if (!info.hash) throw new WebdaError.BadRequest("Missing binary hash");
    return this._cleanUsage(info.hash, uuid);
  }

  /**
   * Write a binary file's stream to the local filesystem under its content-hash directory.
   *
   * @param file - the binary file to store
   * @param object - the model instance
   * @param attribute - the binary attribute name
   */
  async _store(file: BinaryFile, object: CoreModel, attribute: string) {
    // Computed from the bytes: a preset hash that does not match is rejected, a preset challenge is replaced
    const { hash, challenge } = await this.verifiedHashes(file);
    const uuid = object.getUUID();
    if (!uuid) throw new WebdaError.BadRequest("Missing object identifier");
    const model = useModelId(object.constructor);
    if (!model) throw new WebdaError.BadRequest("Missing model identifier");
    // The folder may exist already: created by a challenge waiting for its upload
    fs.mkdirSync(this._getPath(hash), { recursive: true });
    const map = await file.get();
    await new Promise((resolve, reject) => {
      map
        .pipe(fs.createWriteStream(this._getPath(hash, "data")))
        .on("error", reject)
        .on("finish", resolve);
    });

    this._touch(this._getPath(hash, this.proofMarker(challenge)));
    this._touch(this._getPath(hash, this.usageMarker({ model, attribute, uuid })));
  }

  /**
   * @override
   */
  async store(object: CoreModel, property: string, file: BinaryFile): Promise<any> {
    // Computed from the bytes: a preset hash that does not match is rejected, a preset challenge is replaced
    const { hash, challenge } = await this.verifiedHashes(file);
    const uuid = object.getUUID();
    if (!uuid) throw new WebdaError.BadRequest("Missing object identifier");
    const storeName = useModelId(object.constructor);
    if (!storeName) throw new WebdaError.BadRequest("Missing model identifier");
    const fileInfo = file.toBinaryFileInfo();
    this.checkMap(<any>object, property);
    // The data may be missing although the folder exists (a challenge waiting for its upload)
    if (fs.existsSync(this._getPath(hash, "data"))) {
      this._touch(this._getPath(hash, this.proofMarker(challenge)));
      this._touch(this._getPath(hash, this.usageMarker({ model: storeName, attribute: property, uuid })));
      await this.uploadSuccess(<any>object, property, fileInfo);
      return;
    }
    await this._store(file, object, property);
    await this.uploadSuccess(<any>object, property, fileInfo);
  }

  /**
   * Clean all data
   */
  async ___cleanData(): Promise<void> {
    fs.mkdirSync(this.parameters.folder, { recursive: true });
    for (const entry of fs.readdirSync(this.parameters.folder)) {
      fs.rmSync(`${this.parameters.folder}/${entry}`, { recursive: true, force: true });
    }
  }
}
