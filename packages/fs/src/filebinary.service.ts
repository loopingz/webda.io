import * as fs from "fs";
import { join } from "path";
import { Readable } from "stream";
import {
  BinaryFile,
  BinaryMap,
  BinaryNotFoundError,
  BinaryService,
  CloudBinary,
  CloudBinaryParameters,
  CoreModel,
  CoreModelWithBinary,
  CryptoService,
  Inject,
  MemoryBinaryFile,
  OperationContext,
  WebContext,
  WebdaError
} from "@webda/core";
import { useModel, useModelId } from "@webda/core";

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
   * @default 10Mb
   */
  maxSize?: number;
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
 * /folder/{hash}/{targetStore}_{uuid}
 * /folder/{hash}/challenge
 *
 * It takes one parameter
 *  folder: "path"
 *
 * See Binary the general interface
 * @category CoreServices
 * @WebdaModda
 */
export class FileBinary<T extends FileBinaryParameters = FileBinaryParameters> extends CloudBinary<T> {
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
   * Create the storage folder if needed
   */
  computeParameters() {
    super.computeParameters();
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
    const path = this._getPath(info.hash, "data");
    if (!fs.existsSync(path)) {
      throw new BinaryNotFoundError(info.hash, this.getName());
    }
    return fs.createReadStream(path);
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
  _getPath(hash: string, postfix: string = undefined) {
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
  _touch(filePath, mode = 0o600) {
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
  async getToken(hash: string, method: "PUT" | "GET", expiresIn: number = 60, target?: UploadTarget): Promise<string> {
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
  async getPutUrl(ctx: OperationContext<BinaryFile>, hash?: string, target?: UploadTarget) {
    hash ??= (await ctx.getInput()).hash;
    const token = await this.getToken(hash, "PUT", 60, target);
    if (ctx instanceof WebContext) {
      return ctx.getHttpContext().getAbsoluteUrl(this.parameters.url + "/upload/data/" + hash + `?token=${token}`);
    }
    return this.parameters.url + "/upload/data/" + hash + `?token=${token}`;
  }

  /**
   * Usage marker of an object attribute in a hash folder: `<model>_<attribute>_<uuid>`, with the `/` of the model
   * identifier replaced (it is a file name)
   * @param target - the object attribute
   * @returns the marker file name
   */
  protected usageMarker(target: Pick<UploadTarget, "model" | "attribute" | "uuid">): string {
    return `${target.model.replace(/\//g, "-")}_${target.attribute}_${target.uuid}`;
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
  ): Promise<{ url: string; method: string }> {
    info ??= await context.getInput();
    const target: UploadTarget = {
      model: useModelId(object.constructor),
      uuid: object.getUUID(),
      attribute,
      info: { name: info.name, size: info.size, mimetype: info.mimetype, metadata: info.metadata }
    };
    if (fs.existsSync(this._getPath(info.hash, "data")) && this.challenge(info.hash, info.challenge)) {
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
    this._touch(this._getPath(result.hash, "_" + result.challenge));
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
   * @override
   */
  async getUsageCount(hash: string) {
    const path = this._getPath(hash);
    if (!fs.existsSync(path)) {
      return 0;
    }
    const files = fs.readdirSync(path);
    return files.length - 2;
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
    uuid = uuid.startsWith("_") ? uuid : `_${uuid}`;
    const files = fs.readdirSync(p);
    files
      .filter(f => f.endsWith(attribute ? `_${attribute}${uuid}` : `${uuid}`))
      .forEach(f => fs.unlinkSync(this._getPath(hash, f)));

    if (files.length == 3) {
      await this._cleanHash(hash);
    }
  }

  /**
   * @override
   */
  async delete(object: CoreModelWithBinary, property: string, index?: number): Promise<void> {
    const hash = (index !== undefined ? object[property][index] : (object[property] as any)).hash;
    await this.deleteSuccess(<any>object, property, index);
    await this._cleanUsage(hash, object.getUUID(), property);
  }

  /**
   * Verify that a binary with the given hash exists and contains the expected challenge marker.
   *
   * @param hash - the content hash
   * @param challenge - the challenge string
   * @returns true if the challenge marker exists
   */
  challenge(hash, challenge) {
    const path = this._getPath(hash);
    return fs.existsSync(path) && fs.existsSync(`${path}/_${challenge}`);
  }

  /**
   * @override
   */
  async cascadeDelete(info: BinaryMap, uuid: string) {
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
    fs.mkdirSync(this._getPath(file.hash));
    const map = await file.get();
    await new Promise((resolve, reject) => {
      map
        .pipe(fs.createWriteStream(this._getPath(file.hash, "data")))
        .on("error", reject)
        .on("finish", resolve);
    });

    this._touch(this._getPath(file.hash, "_" + file.challenge));
    this._touch(
      this._getPath(
        file.hash,
        this.usageMarker({ model: useModelId(object.constructor), attribute, uuid: object.getUUID() })
      )
    );
  }

  /**
   * @override
   */
  async store(object: CoreModel, property: string, file: BinaryFile): Promise<any> {
    await file.getHashes();
    const storeName = useModelId(object.constructor);
    const fileInfo = file.toBinaryFileInfo();
    this.checkMap(<any>object, property);
    if (fs.existsSync(this._getPath(file.hash))) {
      this._touch(
        this._getPath(file.hash, this.usageMarker({ model: storeName, attribute: property, uuid: object.getUUID() }))
      );
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
    (await import("fs-extra")).emptyDirSync(this.parameters.folder);
  }
}
