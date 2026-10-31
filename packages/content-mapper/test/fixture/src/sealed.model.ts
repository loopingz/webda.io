import { UuidModel } from "./runtime.js";
import { Service, ServiceParameters } from "./runtime.js";
import type { WebdaQLString } from "./query.service.js";

/**
 * Mirror of the `SealedField` behavior of @webda/core: an envelope the server cannot read.
 * @WebdaBehavior Webda/Sealed
 */
export class SealedField<T = any> {
  kid: string = "";
  ct: string = "";
  declare __value?: T;
}

/** A model with a sealed field and permission queries on it. */
export class SealedNote extends UuidModel {
  title: string = "";
  owner: string = "";
  content: SealedField<{ body: string }>;

  /**
   * Permission filter: the sealed field never matches.
   * @param userId - the caller
   * @returns the filter
   */
  static getPermissionQuery(userId?: string): null | { partial: boolean; query: string } {
    if (!userId) return { partial: false, query: "content = 'x'" };
    return {
      partial: true,
      query: userId.length > 3 ? `owner = '${userId}' OR content.body = 'y'` : "title = 'z'"
    };
  }
}

/** A model whose permission query is not static: not a permission query. */
export class PlainNote extends UuidModel {
  title: string = "";
  content: SealedField<string>;
  getPermissionQuery(): { partial: boolean; query: string } {
    return { partial: false, query: "content = 'instance'" };
  }
}

/** A model without sealed fields: nothing to warn about in its permission query. */
export class OpenNote extends UuidModel {
  title: string = "";
  static getPermissionQuery(): { partial: boolean; query: string } {
    return { partial: false, query: "title = 'open'" };
  }
}

/** A model without a name: not a model. */
export default class {
  content: SealedField<string>;
  static getPermissionQuery(): { partial: boolean; query: string } {
    return { partial: false, query: "content = 'anonymous'" };
  }
}

/** Parameters. */
export class SealedParameters extends ServiceParameters {
  endpoint: string = "";
}

/** Service querying sealed notes. */
export class SealedService extends Service<SealedParameters> {
  /**
   * Run a query.
   * @param query - the query
   * @returns nothing
   */
  find(query: WebdaQLString<SealedNote>): void {
    void query;
  }

  /** Call sites the generator must inspect. */
  run(id: string): void {
    this.find("title = 'x'");
    this.find("content = 'x' AND title = 'y'");
    this.find(`content.body = '${id}'`);
    this.find("contnt = 'typo'");
  }
}
