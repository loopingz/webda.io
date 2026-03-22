import { UuidModel, RelateTo, Model, WEBDA_PRIMARY_KEY, OneToMany } from "@webda/models";
import type { Post } from "./Post";

/**
 * Tag model for categorizing posts
 */
export class Tag extends Model {
  /**
   * Primary key: slug
   */
  [WEBDA_PRIMARY_KEY] = ["slug"] as const;
  /**
   * Tag name
   * @minLength 2
   * @maxLength 30
   */
  name!: string;

  /**
   * URL-friendly slug
   * @minLength 2
   * @maxLength 50
   * @pattern ^[a-z0-9-]+$
   */
  slug!: string;

  /**
   * Tag description
   * @maxLength 200
   */
  description?: string;

  /**
   * Tag color (hex)
   * @pattern ^#[0-9A-Fa-f]{6}$
   */
  color?: string;

  // Relations
  posts!: OneToMany<Post, Tag, "tags">; // Posts associated with this tag
}
