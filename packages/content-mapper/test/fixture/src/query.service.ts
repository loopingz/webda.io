import { Service, ServiceParameters } from "./runtime.js";

/** Branded query string, mirroring @webda/ql's WebdaQLString<T>. */
export type WebdaQLString<T> = string & { __webdaQL?: T };

/** A queryable shape. */
export class Doc {
  uuid: string = "";
  title: string = "";
  createdAt: string = "";
}

/** Parameters. */
export class QueryParameters extends ServiceParameters {
  endpoint: string = "";
}

/** Service exposing a query API. */
export class QueryService extends Service<QueryParameters> {
  /**
   * Run a query.
   * @param query - the query
   * @returns nothing
   */
  find(query: WebdaQLString<Doc>): void {
    void query;
  }

  /**
   * Run a query with bound parameters.
   * @param query - the query, with `?` or `:name` placeholders
   * @param params - the parameter values
   * @returns nothing
   */
  findWith(query: WebdaQLString<Doc>, params?: unknown[] | Record<string, unknown>): void {
    void query;
    void params;
  }

  /** Call sites the generator must inspect. */
  run(id: string): void {
    this.find("title = 'x'");
    this.find(`uuid = '${id}'`);
    this.find("titel = 'typo'");
    this.findWith("createdAt > ? AND title = ?", [id, "x"]);
    this.findWith("tilte = :t", { t: id });
  }
}
