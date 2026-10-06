---
name: webda-models
description: Use when adding or changing a Webda model, its fields, validation, primary key or relations to other models
---

# Webda models

## When to use

Adding a model, adding or changing a field, its validation, the primary key, or a relation between models.

## Pattern

A model is a class in `src/models/<Name>.model.ts` extending `UuidModel` (generated `uuid` key) or `Model` (your own key). Fields are class properties; validation comes from JSDoc tags, which the compiler turns into the JSON schema. Run `npm run build` after changing a model: it regenerates `webda.module.json` and `.webda/`.

```ts
import { BelongTo, Model, OneToMany, UuidModel, WEBDA_PRIMARY_KEY } from "@webda/models";

/**
 * A product category, identified by its slug
 */
export class Category extends Model {
  [WEBDA_PRIMARY_KEY] = ["slug"] as const;

  /**
   * URL-friendly identifier
   * @pattern ^[a-z0-9-]+$
   */
  slug!: string;

  /**
   * @minLength 2
   * @maxLength 50
   */
  name!: string;

  products!: OneToMany<Product, Category, "category">;
}

/**
 * A product of a category
 */
export class Product extends UuidModel {
  /**
   * @minLength 1
   */
  title!: string;

  /**
   * @minimum 0
   */
  price!: number;

  /**
   * Optional fields use `?`
   * @maxLength 500
   */
  description?: string;

  /**
   * Category the product belongs to
   */
  category!: BelongTo<Category>;
}
```

Relations:

| Type                                       | Meaning                                                                                              |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `BelongTo<Parent>`                         | this model belongs to a parent; deleting the parent does not delete it, delete the children yourself |
| `RelateTo<Other>`                          | a link to another model, no cascade                                                                  |
| `OneToMany<Child, ThisModel, "attribute">` | the children whose `attribute` points to this model (read side of `BelongTo`/`RelateTo`)             |
| `ManyToMany<Other>`                        | many-to-many links                                                                                   |

A `BelongTo` or `RelateTo` field is stored as the key of the target: pass the key of the parent, `parent.getUUID()` for a model with a `uuid` key.

```ts
import { BelongTo, UuidModel } from "@webda/models";

export class Shelf extends UuidModel {
  name!: string;
}

export class Book extends UuidModel {
  title!: string;
  shelf!: BelongTo<Shelf>;
}

export async function addBook(shelf: Shelf): Promise<Book> {
  return Book.create({ title: "Dune", shelf: shelf.getUUID() });
}
```

The `OneToMany` side is queried like a model, restricted to the children of that instance:

```ts
import { BelongTo, OneToMany, UuidModel } from "@webda/models";

export class Author extends UuidModel {
  name!: string;
  articles!: OneToMany<Article, Author, "author">;
}

export class Article extends UuidModel {
  title!: string;
  author!: BelongTo<Author>;
}

export async function articleTitles(author: Author): Promise<string[]> {
  const { results } = await author.articles.query("title != ? ORDER BY title LIMIT 20", [""]);
  return results.map(article => article.title);
}
```

Read and write data through the model (see the `webda-stores` skill): `Product.create({...})`, `Product.ref(uuid).get()`, `Product.query("price > 10")`.

## Common mistakes

```text
@Model() / @Expose() decorators and CoreModel  → v3 APIs: extend Model or UuidModel, no decorators
@Inject("productStore") store: Store           → never use a store directly: Product.create / Product.query
Editing webda.module.json or .webda/           → generated: change the model and run npm run build
```

- Name model files `*.model.ts` (the build fails on a model file without that suffix); `src/models/` is the convention.
- Import related models with `import type` to avoid circular imports.

## Verify

`npm run build` must succeed (it reports invalid JSDoc tags and relation targets), then `npm test`.

## Reference

https://docs.webda.io

Written for Webda 4.0.0-beta.
