import * as fs from "fs";
import { Context } from "../utils/context";
import { Binary, BinaryFile, BinaryMap, BinaryNotFoundError, BinaryParameters, MemoryBinaryFile } from "./binary";
import { Service, ServiceParameters } from "./service";
import { join } from "path";
import { CoreModel } from "..";
import { Readable } from "stream";
import * as jwt from "jsonwebtoken";

export class FileBinaryParameters extends BinaryParameters {
  /**
   * Define the folder to store objects in
   */
  folder: string;

  constructor(params: any, service: Service) {
    super(params, service);
    if (!this.folder.endsWith("/")) {
      this.folder += "/";
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
 */
class FileBinary<T extends FileBinaryParameters = FileBinaryParameters> extends Binary<T> {
  /**
   * Load parameters
   *
   * @param params
   */
  loadParameters(params: any): ServiceParameters {
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

  _initRoutes(): void {
    super._initRoutes();
    // Will redirect to this URL for direct upload
    let url = this.parameters.expose.url + "/upload/data/{hash}{?token}";
    let name = this.getOperationName();
    if (!this.parameters.expose.restrict.create) {
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
  }

  /**
   * @inheritdoc
   */
  async _get(info: BinaryMap): Promise<Readable> {
    var path = this._getPath(info.hash, "data");
    if (!fs.existsSync(path)) {
      throw new BinaryNotFoundError(info.hash, this.getName());
    }
    return fs.createReadStream(path);
  }

  _getPath(hash: string, postfix: string = undefined) {
    if (postfix === undefined) {
      return this.parameters.folder + hash;
    }
    return this.parameters.folder + hash + "/" + postfix;
  }

  _touch(path) {
    if (!fs.existsSync(path)) {
      fs.closeSync(fs.openSync(path, "w"));
    }
  }

  getPutUrl(ctx: Context) {
    // Get a full URL, this method should be in a Route Object
    // Add a JWT token for 60s
    let token = jwt.sign({ hash: ctx.getRequestBody().hash }, this.getWebda().getSecret(), {
      expiresIn: 60
    });
    return ctx
      .getHttpContext()
      .getAbsoluteUrl(this.parameters.expose.url + "/upload/data/" + ctx.getRequestBody().hash + `?token=${token}`);
  }

  /**
   * Will give you the redirect url
   *
   * @ignore
   */
  async putRedirectUrl(ctx: Context): Promise<{ url: string; method: string }> {
    let body = ctx.getRequestBody();
    let uid = ctx.parameter("uid");
    let store = ctx.parameter("store");
    let property = ctx.parameter("property");
    let result = { url: this.getPutUrl(ctx), method: "PUT" };
    if (fs.existsSync(this._getPath(body.hash, store + "_" + uid))) {
      if (!fs.existsSync(this._getPath(body.hash, "data"))) {
        return result;
      }
      // If the link is already register just return directly ok
      return;
    }
    // Get the target object to add the mapping
    let targetStore = this._verifyMapAndStore(ctx);
    let object = await targetStore.get(uid, ctx);
    await this.uploadSuccess(object, property, body);
    // Need to store the usage of the file
    if (!fs.existsSync(this._getPath(body.hash))) {
      fs.mkdirSync(this._getPath(body.hash));
    }
    this._touch(this._getPath(body.hash, store + "_" + uid));
    if (this.challenge(body.hash, body.challenge)) {
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
  async storeBinary(ctx: Context) {
    let body = ctx.getRequestBody();
    var result = await new MemoryBinaryFile(Buffer.from(body), {
      mimetype: ctx.getHttpContext().getHeader("content-type"),
      name: "",
      size: parseInt(ctx.getHttpContext().getHeader("content-length"))
    }).getHashes();
    if (ctx.parameter("hash") !== result.hash) {
      throw 400;
    }
    // Verify token
    try {
      let dt = jwt.verify(ctx.parameter("token"), this.getWebda().getSecret());
      if (dt.hash !== result.hash) {
        throw 403;
      }
    } catch (err) {
      throw 403;
    }
    if (!fs.existsSync(this._getPath(result.hash))) {
      // The folder should have been create by a previous request
      throw 412;
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
    var path = this._getPath(hash);
    if (!fs.existsSync(path)) {
      return 0;
    }
    var files = fs.readdirSync(path);
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
      var files = fs.readdirSync(p);
      files.forEach(file => fs.unlinkSync(join(p, file)));
      fs.rmdirSync(p);
    } catch (err) {}
  }

  /**
   * @override
   */
  async _cleanUsage(hash: string, uuid: string): Promise<void> {
    const p = this._getPath(hash);
    if (!fs.existsSync(p)) return;
    var files = fs.readdirSync(p);
    files.filter(f => f.endsWith(uuid)).forEach(f => fs.unlinkSync(this._getPath(hash, f)));

    if (files.length == 3) {
      await this._cleanHash(hash);
    }
  }

  /**
   * @inheritdoc
   */
  async delete(object: CoreModel, property: string, index: number): Promise<void> {
    var hash = object[property][index].hash;
    await this.deleteSuccess(object, property, index);
    await this._cleanUsage(hash, object.getUuid());
  }

  challenge(hash, challenge) {
    var path = this._getPath(hash);
    return fs.existsSync(path) && fs.existsSync(`${path}/_${challenge}`);
  }

  /**
   * @inheritdoc
   */
  async cascadeDelete(info: BinaryMap, uuid: string) {
    return this._cleanUsage(info.hash, "_" + uuid);
  }

  async _store(file: BinaryFile, object: CoreModel) {
    fs.mkdirSync(this._getPath(file.hash));
    await new Promise(async (resolve, reject) => {
      (await file.get())
        .pipe(fs.createWriteStream(this._getPath(file.hash, "data")))
        .on("error", reject)
        .on("finish", resolve);
    });

    // Store the challenge
    this._touch(this._getPath(file.hash, "_" + file.challenge));
    this._touch(this._getPath(file.hash, object.getStore().getName() + "_" + object.getUuid()));
  }

  /**
   * @inheritdoc
   */
  async store(object: CoreModel, property: string, file: BinaryFile): Promise<any> {
    await file.getHashes();
    const storeName = object.getStore().getName();
    const fileInfo = file.toBinaryFileInfo();
    this.checkMap(storeName, property);
    if (fs.existsSync(this._getPath(file.hash))) {
      this._touch(this._getPath(file.hash, `${storeName}_${object.getUuid()}`));
      await this.uploadSuccess(object, property, fileInfo);
      return;
    }
    await this._store(file, object);
    await this.uploadSuccess(object, property, fileInfo);
  }

  /**
   * Clean all data
   */
  async ___cleanData(): Promise<void> {
    require("fs-extra").emptyDirSync(this.parameters.folder);
  }
}

export { FileBinary };
