import { HttpContext, IOperationContext, OwnerModel, WebContext, WebdaError, useRegistry } from "@webda/core";
import { createChecker } from "is-in-subnet";
import { HawkService, type HawkCredentials } from "./hawk.service.js";
import { randomBytes } from "node:crypto";

/**
 * Subnet checkers per key, kept out of the model attributes
 */
const checkers = new WeakMap<ApiKey, (address: string) => boolean>();

/**
 * Api Key to use with hawk
 *
 * @WebdaModel
 */
export default class ApiKey extends OwnerModel {
  /**
   * Create a new ApiKey
   * @param data - initial data
   */
  constructor(data?: Partial<ApiKey>) {
    super();
    Object.assign(this, data);
  }

  /**
   * Friendly user name of the key
   */
  name: string;
  /**
   * Retriction on URL to apply to the key
   *
   * Split per method, each item of the array contains
   * a regexp to validate the url used
   */
  permissions?: {
    GET: string[];
    PUT: string[];
    DELETE: string[];
    POST: string[];
  };
  /**
   * Algorithm to use with hawk
   */
  algorithm: string = "sha256";
  /**
   * Secret that will stay within server
   */
  __secret: string;
  /**
   * Authorize those origins only (regexp)
   */
  origins?: string[];

  /**
   * If defined the key is only usable from these ips
   *
   * Support of DNS is not yet ready
   */
  whitelist?: string[];

  /**
   * Formatting structure needed for Hawk credentials
   * @returns the hawk credentials {id,key,algorithm}
   */
  toHawkCredentials(): HawkCredentials {
    return {
      id: this.uuid,
      key: this.__secret,
      algorithm: this.algorithm
    };
  }

  /**
   * Generate secret for key
   * @returns the secret
   */
  generateSecret(): string {
    const secret = this["secret"] || randomBytes(64).toString("base64").replace(/=/g, "");
    this["secret"] = undefined;
    return secret;
  }

  /**
   * @override
   * @param ctx - the operation context
   * @param action - the action
   * @returns true or the reason of refusal
   */
  async canAct(ctx: IOperationContext, action: string): Promise<string | boolean> {
    // Add secret generation if not provided by input
    if (action === "create" && this.uuid !== "origins") {
      this.__secret ??= this.generateSecret();
      if (this.__secret.length < 32) {
        throw new WebdaError.BadRequest("Secret too short");
      }
    }
    return super.canAct(ctx, action);
  }

  /**
   * Check origin masks, and returns TRUE when at least one pattern is matching to this context's origin
   * @param ctx - the http context
   * @returns TRUE if this origin is authorized with the current key
   */
  checkOrigin(ctx: HttpContext): boolean {
    const origin = ctx.getUniqueHeader("origin", "");
    if (!this.origins || !this.origins.length) {
      // There is no origin contraints
      return true;
    }

    // Returns TRUE as soon as we found a matching authorized regexp
    for (const x in this.origins) {
      const pattern = new RegExp(this.origins[x]);
      if (origin.match(pattern)) {
        return true;
      }
    }

    // Origins constraints are not validated
    return false;
  }

  /**
   * Authorize access depending origin, method and permissions allowed
   * @param context - the request context
   * @returns TRUE if all key's contraints are authorized
   */
  canRequest(context: WebContext): boolean {
    const ctx = context.getHttpContext();
    if (!this.checkOrigin(ctx)) {
      return false;
    }
    // Check ip whitelist
    if (this.whitelist) {
      if (!checkers.has(this)) {
        checkers.set(this, createChecker(this.whitelist.map(c => (c.indexOf("/") < 0 ? `${c}/32` : c))));
      }
      if (!checkers.get(this)(ctx.getClientIp())) {
        return false;
      }
    }
    if (!this.permissions) {
      return true;
    }
    let method = ctx.getMethod();
    if (method === "PATCH") {
      method = "PUT";
    }
    if (!this.permissions[method]) {
      return false;
    }
    for (const i in this.permissions[method]) {
      if (ctx.getUrl().match(this.permissions[method][i])) {
        return true;
      }
    }
    return false;
  }

  /**
   * Update the origins in the registry
   */
  async updateOrigins() {
    if (this.origins !== undefined && this.origins.length > 0) {
      await useRegistry().put(HawkService.RegistryEntry, {
        [`key_${this.uuid}`]: {
          statics: this.origins.filter((l: string) => !l.startsWith("regexp://")),
          patterns: this.origins.filter((l: string) => l.startsWith("regexp://")).map((l: string) => l.substring(9))
        }
      });
    } else if (await useRegistry().exists(HawkService.RegistryEntry)) {
      await useRegistry().removeAttribute(HawkService.RegistryEntry, `key_${this.uuid}`);
    }
  }
}

export { ApiKey };
