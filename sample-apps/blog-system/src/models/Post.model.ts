import { BelongTo, Contains, ManyToMany, Model, WEBDA_PRIMARY_KEY, WEBDA_EVENTS, ModelEvents } from "@webda/models";
import type { User } from "./User.model.js";
import type { Comment } from "./Comment.model.js";
import type { Tag } from "./Tag.model.js";
import { Binaries, Binary, Operation } from "@webda/core";
import type { IOperationContext } from "@webda/core";

/**
 * Events emitted by posts, on top of the model events
 */
export class PostEvents<T extends Post> {
  Publish: {
    post: T;
  };
}
/**
 * Post model representing blog posts
 *
 * Permission model (see `canAct` below): anyone reads, logged-in users create, the author edits, deletes and
 * publishes. The author is always the caller: it is set on create and never taken from client input.
 */
export class Post extends Model {
  [WEBDA_PRIMARY_KEY] = ["slug"] as const;
  /**
   * Add an event
   */
  [WEBDA_EVENTS]: ModelEvents<this> & PostEvents<this>;
  /**
   * Post title
   * @minLength 5
   * @maxLength 200
   */
  title!: string;

  /**
   * URL-friendly slug
   * @minLength 5
   * @maxLength 250
   * @pattern ^[a-z0-9-]+$
   */
  slug!: string;

  /**
   * Post content (markdown)
   * @minLength 10
   */
  content!: string;

  /**
   * Post excerpt for listings
   * @maxLength 500
   */
  excerpt?: string;

  /**
   * Featured image URL
   * @format uri
   */
  featuredImage?: string;

  /**
   * Main image for the post, stored as binary data with width and height metadata. This demonstrates how to use binary data in a model, which can be useful for storing images or files directly in the database.
   */
  mainImage: Binary<{ width: number; height: number }>;

  /**
   * Additional images for the post, stored as an array of binaries with width and height metadata. This shows how to manage multiple related binary files in a model.
   */
  images: Binaries<{ width: number; height: number }>;

  /**
   * Publication status
   * @enum ["draft", "published", "archived"]
   */
  status!: "draft" | "published" | "archived";

  /**
   * View count
   * @minimum 0
   */
  viewCount!: number;

  /**
   * Post creation date
   * @readonly
   */
  createdAt!: Date;

  /**
   * Last update date
   * @readonly
   */
  updatedAt!: Date;

  /**
   * Publication date
   * @readonly
   */
  publishedAt?: Date;

  // Relations
  author!: BelongTo<User>;
  comments!: Contains<Comment>;
  /**
   * PUT|GET /posts/:slug/tags to get all tags for a post with a query
   * POST /posts/:slug/tags/123 to add a tag
   * DELETE /posts/:slug/tags/123 to remove a tag
   * PATCH /posts/:slug to update tags with an array of tag slugs
   * PUT /posts/:slug to replace tags with an array of tag slugs, if tags is not defined nothing is changed
   *
   * On the other side
   * PUT|GET /tags/:slug/posts to get all posts with that tag with a query
   * POST /tags/:slug/posts/:postSlug to add a post
   * DELETE /tags/:slug/posts/:postSlug to remove a post
   * PATCH /tags/:slug to update posts with an array of post slugs
   * PUT /tags/:slug to replace posts with an array of post slugs, if posts is not defined nothing is changed
   *
   * This is a many-to-many relation that demonstrates the power of composite keys and join tables
   * with full type inference and relation management.
   */
  tags!: ManyToMany<Tag>;

  /**
   * The author is server-managed: never taken from client input (create, update, patch, GraphQL)
   * @returns the protected attributes
   */
  static getProtectedAttributes(): string[] {
    return ["author"];
  }

  /**
   * Called on a new post built from client input, before the "create" check: the caller is the author
   * @param context - the caller context
   */
  prepareCreate(context: IOperationContext): void {
    (this as any).author = context.getCurrentUserId();
    this.createdAt ??= new Date();
    this.updatedAt ??= this.createdAt;
  }

  /**
   * Permission rule (instance form: the decision depends on the post)
   * - "get": anyone, drafts included (a real blog would hide drafts from non-authors);
   * - "create": any logged-in user (the author is the caller, see `prepareCreate`);
   * - "update", "delete", "publish" and the binary actions: the author.
   * @param context - the caller context
   * @param action - the action
   * @returns true or the refusal reason
   */
  async canAct(context: IOperationContext, action: string): Promise<boolean | string> {
    const userId = context.getCurrentUserId();
    if (action === "get" || action.endsWith(".download") || action.endsWith(".get")) {
      return true;
    }
    if (!userId) {
      return "Login required";
    }
    if (action === "create") {
      return true;
    }
    return this.author?.toString() === userId ? true : "Only the author";
  }

  /**
   * Publish the post somewhere: the author only (instance rule)
   * @param destination - where to publish
   * @returns the publication id
   */
  @Operation()
  async publish(destination: "linkedin" | "twitter"): Promise<string> {
    return `${destination}_${this.slug}_${Date.now()}`;
  }
}
