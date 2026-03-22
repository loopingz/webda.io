import { BelongTo, Contains, ManyToMany, Model, WEBDA_PRIMARY_KEY, WEBDA_EVENTS, ModelEvents } from "@webda/models";
import type { User } from "./User";
import type { Comment } from "./Comment";
import type { Tag } from "./Tag";
import { Operation } from "@webda/core";

export class PostEvents<T extends Post> {
  Publish: {
    post: T;
  };
}
/**
 * Post model representing blog posts
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

  @Operation()
  async publish(destination: "linkedin" | "twitter"): Promise<string> {
    return `${destination}_${this.slug}_${Date.now()}`;
  }
}
