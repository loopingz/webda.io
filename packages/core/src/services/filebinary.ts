import * as fs from "fs";
import { join } from "path";
import { Readable } from "stream";
import { CloudBinary, CloudBinaryParameters, CoreModel, CoreModelDefinition, WebdaError } from "../index";
import { OperationContext, WebContext } from "../utils/context";
import { BinaryFile, BinaryMap, BinaryModel, BinaryNotFoundError, BinaryService, MemoryBinaryFile } from "./binary";
import { CryptoService } from "./cryptoservice";
import { Inject } from "./service";

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

  constructor(params: any, service: BinaryService) {
    super(params, service);
    if (!this.folder.endsWith("/")) {
      this.folder += "/";
    }
    this.maxSize ??= 10 * 1024 * 1024;
    // Remove trailing /
    if (this.url && this.url.endsWith("/")) {
      this.url = this.url.substring(0, this.url.length - 1);
    }
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
   * @param params
   */
  loadParameters(params: any): CloudBinaryParameters {
    return new FileBinaryParameters(params, this);
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

  initRoutes(): void {
    super.initRoutes();
    // We do not want to expose by default
    if (this.parameters.url === undefined) {
      return;
    }
    // Will redirect to this URL for direct download
    let url = this.parameters.url + "/download/data/{hash}{?token,content-disposition,content-type}";
    let name = this.getOperationName();
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
  }

  /**
   * Download a binary with a challenge
   */
  async downloadBinaryLink(ctx: WebContext<any, any, { hash: string }>) {
    const { hash } = ctx.getParameters();
    // Verify token
    try {
      let dt = await this.cryptoService.jwtVerify(ctx.parameter("token"));
      if (dt.hash !== hash) {
        throw new WebdaError.Forbidden("Wrong hash");
      }
    } catch (err) {
      throw new WebdaError.Forbidden("Incorrect JWT");
    }
    ctx.writeHead(200, {
      "content-disposition": ctx.parameter("content-disposition"),
      "content-type": ctx.parameter("content-type")
    });
    let map = await this.get({ hash } as BinaryMap);
    // Fake a binary map for this case
    return new Promise<void>((resolve, reject) => {
      const stream = ctx.getStream();
      stream.on("error", reject).on("finish", resolve);
      map.pipe(stream);
    });
  }

  /**
   * @inheritdoc
   */
  async _get(info: BinaryMap): Promise<Readable> {
    let path = this._getPath(info.hash, "data");
    if (!fs.existsSync(path)) {
      throw new BinaryNotFoundError(info.hash, this.getName());
    }
    return fs.createReadStream(path);
  }

  /**
   * Get signed url to download an element
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
   * @param hash
   * @param postfix
   * @returns
   */
  _getPath(hash: string, postfix: string = undefined) {
    if (postfix === undefined) {
      return this.parameters.folder + hash;
    }
    return this.parameters.folder + hash + "/" + postfix;
  }

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
   * @param ctx
   * @param expiresIn
   */
  async getToken(hash: string, method: "PUT" | "GET", expiresIn: number = 60): Promise<string> {
    return this.cryptoService.jwtSign(
      { hash, method },
      {
        expiresIn
      }
    );
  }

  /**
   * Get put URL
   * @param ctx
   * @returns
   */
  async getPutUrl(ctx: OperationContext<BinaryFile>) {
    let body = await ctx.getInput();
    // Get a full URL, this method should be in a Route Object
    // Add a JWT token for 60s
    let token = await this.getToken(body.hash, "PUT");
    if (ctx instanceof WebContext) {
      return ctx.getHttpContext().getAbsoluteUrl(this.parameters.url + "/upload/data/" + body.hash + `?token=${token}`);
    }
    return this.parameters.url + "/upload/data/" + body.hash + `?token=${token}`;
  }

  /**
   * Will give you the redirect url
   *
   * @ignore
   */
  async putRedirectUrl(
    object: CoreModel,
    attribute: string,
    info?: BinaryFile,
    context?: OperationContext<BinaryFile>
  ): Promise<{ url: string; method: string }> {
    info ??= await context.getInput();
    let result = { url: await this.getPutUrl(context), method: "PUT" };
    const marker = `${object.getStore().getName()}_${object.getUuid}_${attribute}`;
    if (fs.existsSync(this._getPath(info.hash, marker))) {
      if (!fs.existsSync(this._getPath(info.hash, "data"))) {
        // 232-237
        return result;
      }
      // If the link is already register just return directly ok
      return;
    }
    // Get the target object to add the mapping
    await this.uploadSuccess(<BinaryModel>object, attribute, info);
    // Need to store the usage of the file
    if (!fs.existsSync(this._getPath(info.hash))) {
      fs.mkdirSync(this._getPath(info.hash));
    }
    this._touch(this._getPath(info.hash, marker));
    if (this.challenge(info.hash, info.challenge)) {
      // Return empty as we dont need to upload the data
      return;
    }
    // Return the url to upload the binary now
    return result;
  }

  /**
   * Store the binary sent
   *
   * Check the hashs match and that a storage folder exists
   * The storage folder should have been created by the putRedirectUrl
   *
   * @ignore
   */
  async storeBinary(ctx: WebContext) {
    let body = await ctx.getHttpContext().getRawBody(this.parameters.maxSize);
    let result = await new MemoryBinaryFile(body, {
      mimetype: (ctx.getHttpContext().getUniqueHeader("content-type") || "application/json").split(";")[0],
      name: "",
      size: parseInt(ctx.getHttpContext().getUniqueHeader("content-length"))
    }).getHashes();
    if (ctx.parameter("hash") !== result.hash) {
      this.log("WARN", "Request hash differ", ctx.parameter("hash"), "!==", result.hash);
      throw new WebdaError.BadRequest("Request hash differ");
    }
    // Verify token
    try {
      let dt = await this.cryptoService.jwtVerify(ctx.parameter("token"));
      if (dt.hash !== result.hash) {
        this.log("WARN", "JWT hash differ", ctx.parameter("hash"), "!==", result.hash);
        throw new WebdaError.Forbidden("JWT hash differ");
      }
    } catch (err) {
      this.log("WARN", "Invalid JWT token");
      throw new WebdaError.Forbidden("Invalid JWT token");
    }
    if (!fs.existsSync(this._getPath(result.hash))) {
      // The folder should have been create by a previous request
      throw new WebdaError.PreconditionFailed("No folder for hash " + result.hash);
    }
    let path = this._getPath(result.hash, "data");
    if (!fs.existsSync(path)) {
      // Save the data
      fs.writeFileSync(path, body);
    }
    // Save the challenge
    this._touch(this._getPath(result.hash, "_" + result.challenge));
  }

  /**
   * @inheritdoc
   */
  async getUsageCount(hash: string) {
    let path = this._getPath(hash);
    if (!fs.existsSync(path)) {
      return 0;
    }
    let files = fs.readdirSync(path);
    return files.length - 2;
  }

  /**
   * Delete any usage marker and hash
   *
   * @param hash to remove
   * @returns
   */
  async _cleanHash(hash: string): Promise<void> {
    const p = this._getPath(hash);
    if (!fs.existsSync(p)) return;
    try {
      let files = fs.readdirSync(p);
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
    let files = fs.readdirSync(p);
    files
      .filter(f => f.endsWith(attribute ? `_${attribute}${uuid}` : `${uuid}`))
      .forEach(f => fs.unlinkSync(this._getPath(hash, f)));

    if (files.length == 3) {
      await this._cleanHash(hash);
    }
  }

  /**
   * @inheritdoc
   */
  async delete(object: CoreModel, property: string, index?: number): Promise<void> {
    let hash = (index !== undefined ? object[property][index] : object[property]).hash;
    await this.deleteSuccess(<BinaryModel>object, property, index);
    await this._cleanUsage(hash, object.getUuid(), property);
  }

  challenge(hash, challenge) {
    let path = this._getPath(hash);
    return fs.existsSync(path) && fs.existsSync(`${path}/_${challenge}`);
  }

  /**
   * @inheritdoc
   */
  async cascadeDelete(info: BinaryMap, uuid: string) {
    return this._cleanUsage(info.hash, uuid);
  }

  async _store(file: BinaryFile, object: CoreModel, attribute: string) {
    fs.mkdirSync(this._getPath(file.hash));
    const map = await file.get();
    await new Promise((resolve, reject) => {
      map
        .pipe(fs.createWriteStream(this._getPath(file.hash, "data")))
        .on("error", reject)
        .on("finish", resolve);
    });

    // Store the challenge
    this._touch(this._getPath(file.hash, "_" + file.challenge));
    this._touch(this._getPath(file.hash, `${object.getStore().getName()}_${attribute}_${object.getUuid()}`));
  }

  /**
   * @inheritdoc
   */
  async store(object: CoreModel, property: string, file: BinaryFile): Promise<any> {
    await file.getHashes();
    const storeName = object.getStore().getName();
    const fileInfo = file.toBinaryFileInfo();
    this.checkMap(object, property);
    if (fs.existsSync(this._getPath(file.hash))) {
      this._touch(this._getPath(file.hash, `${storeName}_${property}_${object.getUuid()}`));
      await this.uploadSuccess(<BinaryModel>object, property, fileInfo);
      return;
    }
    await this._store(file, object, property);
    await this.uploadSuccess(<BinaryModel>object, property, fileInfo);
  }

  /**
   * Clean all data
   */
  async ___cleanData(): Promise<void> {
    (await import("fs-extra")).emptyDirSync(this.parameters.folder);
  }
}
