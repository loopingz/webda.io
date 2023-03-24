import { join } from "path";
import { WebdaError } from "../errors";
import { OperationContext } from "../utils/context";
import { Binary, BinaryMap, BinaryModel, BinaryParameters } from "./binary";

/**
 * Default binary parameters
 */
export class CloudBinaryParameters extends BinaryParameters {
  prefix?: string;

  constructor(params: any, service: Binary) {
    super(params, service);
    this.prefix ??= "";
  }
}

/**
 * CloudBinary abstraction
 */
export abstract class CloudBinary<T extends CloudBinaryParameters = CloudBinaryParameters> extends Binary<T> {
  /**
   * @inheritdoc
   */
  _initRoutes(): void {
    super._initRoutes();
    // Will use getRedirectUrl so override the default route
    let url = this.parameters.expose.url + "/{store}/{uid}/{property}/{index}";
    let name = this.getOperationName();
    if (!this.parameters.expose.restrict.get) {
      this.addRoute(
        url,
        ["GET"],
        this.getRedirectUrl,
        {
          get: {
            description: "Download a binary linked to an object",
            summary: "Download a binary",
            operationId: `get${name}Binary`,
            responses: {
              "302": {
                description: "Redirect to download url"
              },
              "403": {
                description: "You don't have permissions"
              },
              "404": {
                description: "Object does not exist or attachment does not exist"
              },
              "412": {
                description: "Provided hash does not match"
              }
            }
          }
        },
        true
      );
      url = this.parameters.expose.url + "/{store}/{uid}/{property}/{index}/url";
      name = this._name === "Binary" ? "" : this._name;
      this.addRoute(url, ["GET"], this.getRedirectUrlInfo, {
        get: {
          description: "Get a redirect url to binary linked to an object",
          summary: "Get redirect url of a binary",
          operationId: `get${name}BinaryURL`,
          responses: {
            "200": {
              description: "Containing the URL"
            },
            "403": {
              description: "You don't have permissions"
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
   * Redirect to the temporary link to S3 object
   * or return it if returnInfo=true
   *
   * @param ctx of the request
   * @param returnInfo
   */
  async getRedirectUrl(ctx, returnInfo: boolean = false) {
    let uid = ctx.parameter("uid");
    let index = ctx.parameter("index");
    let property = ctx.parameter("property");
    let targetStore = this._verifyMapAndStore(ctx);
    let object = await targetStore.get(uid);
    if (!object || !Array.isArray(object[property]) || object[property].length <= index) {
      throw new WebdaError.NotFound("Object does not exist or attachment does not exist");
    }
    await object.canAct(ctx, "get_binary");
    let url = await this.getRedirectUrlFromObject(object[property][index], ctx);
    if (returnInfo) {
      ctx.write({ Location: url, Map: object[property][index] });
    } else {
      ctx.writeHead(302, {
        Location: url
      });
    }
  }

  /**
   * @override
   */
  loadParameters(params: any) {
    return new CloudBinaryParameters(params, this);
  }

  /**
   * Return the temporary link to S3 object
   * @param ctx
   * @returns
   */
  async getRedirectUrlInfo(ctx) {
    return this.getRedirectUrl(ctx, true);
  }
  /**
   * Get a UrlFromObject
   *
   */
  async getRedirectUrlFromObject(binaryMap, context, expires = 30) {
    await this.emitSync("Binary.Get", {
      object: binaryMap,
      service: this,
      context: context
    });
    return this.getSignedUrlFromMap(binaryMap, expires, context);
  }

  /**
   * Return the S3 key
   * @param hash
   * @param postfix
   * @returns
   */
  _getKey(hash: string, postfix: string = "data"): string {
    return join(`${this.parameters.prefix}`, hash, postfix);
  }

  /**
   * @inheritdoc
   */
  async delete(object: BinaryModel, property: string, index: number) {
    let hash = object[property][index].hash;
    await this.deleteSuccess(object, property, index);
    await this._cleanUsage(hash, object.getUuid());
  }

  /**
   * @inheritdoc
   */
  async cascadeDelete(info: BinaryMap, uuid: string): Promise<void> {
    try {
      await this._cleanUsage(info.hash, uuid);
    } catch (err) {
      this._webda.log("WARN", "Cascade delete failed", err);
    }
  }

  /**
   * Clean usage for a hash
   */
  abstract _cleanUsage(hash: string, uuid: string): Promise<void>;

  /**
   * Retrieve one signed URL to download the file in parameter
   * @param {GetSignedUrlParams} params
   * @returns {string} URL in order to download the file
   */
  abstract getSignedUrlFromMap(map: BinaryMap, expires: number, context: OperationContext): Promise<string>;
}
