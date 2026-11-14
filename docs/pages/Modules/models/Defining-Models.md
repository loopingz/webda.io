---
sidebar_position: 2
sidebar_label: Defining Models
---

# Defining Models

A Webda model is a TypeScript class that extends `Model` or `UuidModel`. Models define your data schema, primary key, validation constraints via JSDoc, and the operations exposed by the REST and GraphQL APIs.

## Base classes

| Class       | Primary key                            | Use when                                     |
| ----------- | -------------------------------------- | -------------------------------------------- |
| `Model`     | User-defined via `[WEBDA_PRIMARY_KEY]` | You want a natural key (slug, composite key) |
| `UuidModel` | `uuid` (auto UUID v4)                  | Default for most user-created entities       |

## Minimal model

```typescript
import { UuidModel } from "@webda/models";

export class Tag extends UuidModel {
  name!: string;
}
```

This alone gives you:

- `GET /tags` — list all tags
- `POST /tags` — create a tag
- `GET /tags/:uuid` — get one tag
- `PUT /tags/:uuid` — replace a tag
- `PATCH /tags/:uuid` — partial update
- `DELETE /tags/:uuid` — delete a tag

## Custom primary key

Use `[WEBDA_PRIMARY_KEY]` to declare a single or composite primary key. The type is inferred from the tuple literal:

```typescript
import { Model, WEBDA_PRIMARY_KEY } from "@webda/models";

// Single slug key — Post is identified by its slug
export class Post extends Model {
  [WEBDA_PRIMARY_KEY] = ["slug"] as const;

  slug!: string;
  title!: string;
}
```

REST URL becomes `/posts/:slug` instead of `/posts/:uuid`.

## Composite primary key

```typescript
import { Model, WEBDA_PRIMARY_KEY } from "@webda/models";
import type { User } from "./User";
import { BelongTo } from "@webda/models";

// UserFollow join table — uniquely identified by (follower, following)
export class UserFollow extends Model {
  [WEBDA_PRIMARY_KEY] = ["follower", "following"] as const;

  follower!: BelongTo<User>;
  following!: BelongTo<User>;
  createdAt!: Date;
}
```

When `getPrimaryKey()` is called on a composite-key model, it returns an object `{ follower, following }`. Its `.toString()` concatenates the values with `_` (configurable via `[WEBDA_PRIMARY_KEY_SEPARATOR]`).

## Field validation via JSDoc

All standard `@webda/content-mapper` JSDoc tags are recognized and embedded in the JSON Schema, which the runtime validates against incoming payloads:

```typescript
export class User extends UuidModel {
  /**
   * Unique username
   * @minLength 3
   * @maxLength 30
   * @pattern ^[a-zA-Z0-9_]+$
   */
  username!: string;

  /**
   * User's email address
   * @format email
   * @minLength 5
   * @maxLength 100
   */
  email!: string;

  /**
   * Account creation date — not writable via API
   * @readonly
   */
  createdAt!: Date;

  /**
   * Optional bio
   * @maxLength 500
   */
  bio?: string;

  /**
   * User website
   * @format uri
   */
  website?: string;
}
```

Supported JSDoc tags: `@minLength`, `@maxLength`, `@pattern`, `@format`, `@minimum`, `@maximum`, `@readonly`, `@enum`, `@default`. See [@webda/content-mapper Validation](../content-mapper/README.md).

### Text sanitization — `@sanitize`

Every string a client sends is HTML-sanitized before it reaches a model: tags are removed and `&`, `<`, `>` are escaped. That is the right default for anything a page may render as is, and the wrong one for other kinds of text: a name is stored as `R&amp;D` instead of `R&D`, `Tom <3 Jerry` as `Tom `, and a Markdown source loses its quotes and code samples.

Tag an attribute `@sanitize <mode>` to say what kind of text it holds:

| Mode | What is stored | Use it for |
| --- | --- | --- |
| `text` (default) | No tag at all, `&`, `<` and `>` escaped as entities | Anything rendered as is in a page |
| `none` | The text exactly as the client sent it | Plain text never rendered as HTML: names, titles, diagram sources. Escape it wherever it is rendered |
| `html` | The HTML, restricted to an allowlist of formatting tags (see below) | Rich text from a WYSIWYG editor |
| `markdown` | The Markdown source as written, without raw HTML nor unsafe link schemes (see below) | Markdown rendered by a CommonMark renderer |

```typescript
export class Team extends UuidModel {
  /**
   * Shown as text, never as HTML
   * @sanitize none
   * @pattern ^[^\p{Cc}\p{Cf}]*$
   */
  displayName!: string;

  /**
   * Sanitized as text (no tag)
   */
  description?: string;

  /**
   * Markdown source
   * @sanitize markdown
   */
  notes?: string;

  /**
   * Rich text
   * @sanitize html
   */
  content?: string;

  /**
   * The mode applies to every label
   * @sanitize none
   */
  labels?: string[];
}
```

The compiler writes `"x-webda-sanitize": "<mode>"` on the property in the model schemas. Rules:

- a mode applies to a `string`, an array of strings or a record of strings (`Record<string, string>`). On any other type the tag is ignored: an object or a free-form value (`Record<string, unknown>`, `any`) is always sanitized as `text`. In a nested object or an array of objects, tag the attributes of that object;
- the text is validated as it is stored: `@pattern`, `@maxLength`... see the sanitized text, which for `none` is what the client sent. A text kept as sent can hold `<script>`: escape it wherever it is rendered, and constrain it with `@pattern` when it must not hold control characters;
- private (`__`), server-managed (`_`), protected and `@readOnly` attributes are still removed from client input, tagged or not (see [Client input](./Permissions.md#client-input));
- a mode this version does not know is sanitized like `text`.

#### `html`

The text goes through [sanitize-html](https://github.com/apostrophecms/sanitize-html) with its default options. What is kept:

- tags: `address`, `article`, `aside`, `footer`, `header`, `h1` to `h6`, `hgroup`, `main`, `nav`, `section`, `blockquote`, `dd`, `div`, `dl`, `dt`, `figcaption`, `figure`, `hr`, `li`, `menu`, `ol`, `p`, `pre`, `ul`, `a`, `abbr`, `b`, `bdi`, `bdo`, `br`, `cite`, `code`, `data`, `dfn`, `em`, `i`, `kbd`, `mark`, `q`, `rb`, `rp`, `rt`, `rtc`, `ruby`, `s`, `samp`, `small`, `span`, `strong`, `sub`, `sup`, `time`, `u`, `var`, `wbr`, `caption`, `col`, `colgroup`, `table`, `tbody`, `td`, `tfoot`, `th`, `thead`, `tr`;
- attributes: `href`, `name` and `target` on `a`, nothing else (no `class`, `style`, `id` nor `on*` handler);
- URL schemes of `href`: `http`, `https`, `ftp`, `mailto`, `tel`, and relative or protocol-relative URLs. A link with another scheme (`javascript:`...) loses its `href`.

Every other tag is removed and its text kept, except `script`, `style`, `textarea` and `option`, removed with their content. There is no `img`. Text outside tags is entity-escaped (`R&D` is stored as `R&amp;D`), as HTML requires.

#### `markdown`

The source is parsed as [CommonMark](https://commonmark.org) by [micromark](https://github.com/micromark/micromark) and kept as written: `&`, `<` and `>` in the text, block quotes, code spans and code blocks are untouched. Only what a renderer would pass through as active content is changed:

| In the source | Stored | Why |
| --- | --- | --- |
| Raw HTML, block or inline: `<script>x</script>`, `<div>`, `<!-- -->` | Every `<` of it becomes `&lt;`: `&lt;script>x&lt;/script>` | A renderer shows it as text. It is escaped, not removed, so `Array<string>` written outside a code span stays readable |
| An autolink with an unsafe scheme: `<javascript:alert(1)>` | `&lt;javascript:alert(1)>` | Same |
| The destination of a link, an image or a reference definition with an unsafe scheme: `[x](javascript:alert(1))`, `![x](data:...)`, `[x]: vbscript:...` | The destination becomes `#`: `[x](#)` | The link stays, it goes nowhere |

A scheme is unsafe when it is not `http`, `https`, `mailto` or `tel`. Relative URLs and anchors (`/a?b=c:d`, `#top`) are kept. The scheme is read after resolving backslash escapes and character references, so `javascript&colon;` is caught. HTML inside a code span, a fenced or an indented code block is code: it is kept.

Sanitizing a text twice gives the same text, so a stored text can be sent back in an update. A text the parser still reports as unsafe after three passes is sanitized as `text`.

Limits to know:

- it follows CommonMark as micromark parses it. A renderer with other rules (a different flavor, syntax extensions that give other constructs a meaning) can read the same source differently;
- it is defense in depth: the renderer must still not enable raw HTML, or must sanitize its output;
- it is not for MDX, where the source is code.

#### Where the modes apply

The tag is honoured by the model operations (create, update, patch) on every transport that calls them (REST, gRPC, MCP), by any operation whose input schema carries the keyword (a service `@Operation` taking a typed object with tagged properties), and by the offline `Sync.Push`. The GraphQL endpoint sanitizes its whole request body as `text`, whatever the tag: a tagged attribute is still sanitized as `text` there.

Code that receives model data outside a model operation applies the same rules with `sanitizeModelText(Model, input)` (then `sanitizeModelInput` to drop the attributes a client cannot write). `sanitizeMarkdown(text)` sanitizes one Markdown source.

## Plural form

By default, the REST route collection is the plural of the class name (`Post` → `/posts`, `Tag` → `/tags`). Override with `[WEBDA_PLURAL]`:

```typescript
import { Model, WEBDA_PRIMARY_KEY, WEBDA_PLURAL } from "@webda/models";

export class Category extends Model {
  [WEBDA_PRIMARY_KEY] = ["slug"] as const;
  [WEBDA_PLURAL] = "categories" as const;

  slug!: string;
  name!: string;
}

// Routes become:
// GET /categories
// GET /categories/:slug
```

## Permission guard — `canAct`

**Models deny every request by default.** The framework asks the static `canAct(context, action, object?)` of the model class before running an operation a client sent; the base implementation forwards to an instance `canAct(context, action)` when the model defines one, and refuses otherwise. Every exposed model must define one of the two forms:

```typescript
import { UuidModel } from "@webda/models";
import type { IOperationContext } from "@webda/core";

export class Comment extends UuidModel {
  content!: string;
  authorId!: string;

  // Instance form: the decision depends on the object
  async canAct(context: IOperationContext, action: string): Promise<boolean | string> {
    if (action === "create") return context.getCurrentUserId() ? true : "Login required";
    if (action === "get") return true;
    return context.getCurrentUserId() === this.authorId ? true : "Author only";
  }
}

export class Tag extends UuidModel {
  name!: string;

  // Static form: the explicit opt-in for an open model (it also gates static actions)
  static canAct(): boolean {
    return true;
  }
}
```

Anything but `true` (`false`, a reason string, an error) is a refusal: HTTP 404, exactly like a missing object, when the caller may not read the object, HTTP 403 when it may read it but not perform the action (or for a create and a static action). Static (class-level) actions are asked without object, so an instance-only model refuses them until it overrides the static method. See [Permissions](./Permissions.md).

## Full example — Post model (blog-system)

```typescript
// sample-apps/blog-system/src/models/Post.ts
import { BelongTo, Contains, ManyToMany, Model, WEBDA_PRIMARY_KEY, WEBDA_EVENTS, ModelEvents } from "@webda/models";
import { Operation } from "@webda/core";
import type { User } from "./User";
import type { Comment } from "./Comment";
import type { Tag } from "./Tag";

export class PostEvents<T extends Post> {
  Publish: { post: T };
}

export class Post extends Model {
  [WEBDA_PRIMARY_KEY] = ["slug"] as const;
  [WEBDA_EVENTS]: ModelEvents<this> & PostEvents<this>;

  /** @minLength 5 @maxLength 200 */
  title!: string;

  /** @minLength 5 @maxLength 250 @pattern ^[a-z0-9-]+$ */
  slug!: string;

  /** @minLength 10 */
  content!: string;

  /** @maxLength 500 */
  excerpt?: string;

  /** @enum ["draft", "published", "archived"] */
  status!: "draft" | "published" | "archived";

  /** @minimum 0 */
  viewCount!: number;

  /** @readonly */
  createdAt!: Date;
  /** @readonly */
  updatedAt!: Date;

  author!: BelongTo<User>;
  comments!: Contains<Comment>;
  tags!: ManyToMany<Tag>;

  @Operation()
  async publish(destination: "linkedin" | "twitter"): Promise<string> {
    return `${destination}_${this.slug}_${Date.now()}`;
  }

  async canAct(_context: any, _action: string): Promise<boolean> {
    return true; // permissive for sample — real apps should check context
  }
}
```

The blog-system `User` also overrides the static `canAct` so its static operations (`login`, `logout`) are reachable; see [Permissions](./Permissions.md#instance-and-static-together).

## Verify

```bash
# Run the model tests in @webda/models
cd packages/models
pnpm test
```

```
✓ packages/models/src/model.spec.ts — all tests pass
```

## See also

- [Relationships](./Relationships.md) — `BelongTo`, `Contains`, `OneToMany`, `ManyToMany`
- [Lifecycle](./Lifecycle.md) — save/update/delete hooks and events
- [Actions](./Actions.md) — `@Operation` decorator
- [Permissions](./Permissions.md) — `canAct` and access control
- [@webda/content-mapper Validation](../content-mapper/README.md) — JSDoc constraint tags
