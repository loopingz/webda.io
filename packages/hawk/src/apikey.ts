import { Context, HttpContext, NotEnumerable, OwnerModel } from "@webda/core";
import { createChecker } from "is-in-subnet";
import { HawkCredentials } from "./hawk";

/**
 * Api Key to use with hawk
 *
 * @WebdaModel
 */
export default class ApiKey extends OwnerModel {
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
   * Subnet checker if needed
   */
  @NotEnumerable
  __checker: (address: string) => boolean;

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
   * @returns {id,key,algorithm}
   */
  toHawkCredentials(): HawkCredentials {
    return {
      id: this.uuid,
      key: this.__secret,
      algorithm: this.algorithm
    };
  }

  /**
   * Check origin masks, and returns TRUE when at least one pattern is matching to this context's origin
   * @param {HttpContext} ctx
   * @returns {boolean} TRUE if this origin is authorized with the current key
   */
  checkOrigin(ctx: HttpContext): boolean {
    const origin = ctx.getUniqueHeader("origin", "");
    if (!this.origins || !this.origins.length) {
      // There is no origin contraints
      return true;
    }

    // Returns TRUE as soon as we found a matching authorized regexp
    for (let x in this.origins) {
      let pattern = new RegExp(this.origins[x]);
      if (origin.match(pattern)) {
        return true;
      }
    }

    // Origins constraints are not validated
    return false;
  }

  /**
   * Authorize access depending origin, method and permissions allowed
   * @param {HttpContext} ctx
   * @returns {boolean} TRUE if all key's contraints are authorized
   */
  canRequest(ctx: HttpContext): boolean {
    if (!this.checkOrigin(ctx)) {
      return false;
    }
    // Check ip whitelist
    if (this.whitelist) {
      this.__checker ??= createChecker(this.whitelist.map(c => (c.indexOf("/") < 0 ? `${c}/32` : c)));
      if (!this.__checker(ctx.getClientIp())) {
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
    for (let i in this.permissions[method]) {
      if (ctx.getUrl().match(this.permissions[method][i])) {
        return true;
      }
    }
    return false;
  }

  async canAct(context: Context, action: string) {
    // Do not allow
    if (this.uuid === "origins") {
      throw 403;
    }
    return super.canAct(context, action);
  }

  async _onSaved() {
    // Do nothing if uuid is origins
    if (this.uuid === "origins") {
      return;
    }
    if (this.origins !== undefined && this.origins.length > 0) {
      const updates: any = {
        uuid: "origins"
      };
      updates[`key_${this.uuid}`] = {
        statics: this.origins.filter((l: string) => !l.startsWith("regexp://")),
        patterns: this.origins.filter((l: string) => l.startsWith("regexp://")).map((l: string) => l.substring(9))
      };
      await this.getStore().update(updates, false, true);
    } else {
      await this.getStore().removeAttribute("origins", <any>`key_${this.uuid}`);
    }
  }

  async _onUpdated() {
    return this._onSaved();
  }
}

export { ApiKey };
