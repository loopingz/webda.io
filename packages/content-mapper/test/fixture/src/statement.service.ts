import { Service, ServiceParameters } from "./runtime.js";
import { Doc, type WebdaQLString } from "./query.service.js";

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
  run(statement: WebdaQLString<Article>): void {
    void statement;
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
  }
}
