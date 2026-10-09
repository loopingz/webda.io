import { Service, ServiceParameters } from "./runtime.js";
import { Doc, type WebdaQLStatement, type WebdaQLString } from "./query.service.js";

/** A model with a nested field. */
export class Article extends Doc {
  author: { name: string } = { name: "" };
  status: string = "";
}

/** Parameters. */
export class StatementParameters extends ServiceParameters {}

/** Service running statements, typed like Repository.deleteMany / updateMany. */
export class StatementService extends Service<StatementParameters> {
  /**
   * Run a statement.
   * @param statement - the statement
   * @returns nothing
   */
  run(statement: WebdaQLStatement<Article>): void {
    void statement;
  }

  /**
   * Run a filter query.
   * @param query - the query
   * @returns nothing
   */
  find(query: WebdaQLString<Article>): void {
    void query;
  }

  /** Call sites the generator must inspect. */
  calls(): void {
    this.run("SELECT title, author.name WHERE status = 'x' ORDER BY title");
    this.run("SELECT titel, author WHERE status = 'x'");
    this.run("UPDATE SET status = 'archived', author.name = ? WHERE createdAt < ?");
    this.run("UPDATE SET statsu = 'x' WHERE uuid = 'a'");
    this.run("DELETE WHERE craetedAt < '2020' LIMIT 10");
    this.run("SELECT title, autor.name");
    this.run("delete where title = 'x'");
    // Statements where a filter query is expected
    this.find("DELETE WHERE title = 'x'");
    this.find("  UPDATE SET title = 'x'");
    this.find("SELECT title WHERE status = 'x'");
  }
}
