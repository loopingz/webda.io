import { Model, ModelRelated } from "./runtime.js";
import type { BelongTo, Files } from "./runtime.js";
import type Author from "./author.model.js";

/** Exercises every relation shape the parity work covers. */
export class Book extends Model {
  /** Alias to ModelLink, target imported as a type only. */
  author: BelongTo<Author>;
  /** Three written type arguments: the attribute is passed. */
  readonly siblings: ModelRelated<Book, Book, "author">;
  /** Two written type arguments: the defaulted attribute is not. */
  readonly related: ModelRelated<Book, Book>;
  /** Array behaviour behind an alias. */
  pages: Files;
}
