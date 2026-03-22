import { UuidModel, Contains, ModelClass, OneToMany, ModelRelated, ModelLinker } from "@webda/models";
import type { Post } from "./Post";
import type { Comment } from "./Comment";
import type { UserFollow } from "./UserFollow";
import { FilterAttributes } from "@webda/tsc-esm";

/**
 * User model representing blog authors and readers
 */
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
   * User's full name
   * @minLength 2
   * @maxLength 50
   */
  name!: string;

  /**
   * User biography
   * @maxLength 500
   */
  bio?: string;

  /**
   * User's website
   * @format uri
   */
  website?: string;

  /**
   * Account creation date
   */
  createdAt!: Date;

  /**
   * Last update date
   */
  updatedAt!: Date;

  // Relations
  posts!: OneToMany<Post, User, "author">; // Posts authored by this user
  comments!: OneToMany<Comment, User, "author">;

  // Self-referential relations (populated via UserFollow)
  followers!: OneToMany<UserFollow, User, "following">; // Users who follow this user
  following!: OneToMany<UserFollow, User, "follower">; // Users this user follows
  static getDeserializers<T extends ModelClass>(
    this: T
  ): Partial<Record<keyof InstanceType<T>, (value: any) => any>> | undefined {
    return {
      createdAt: UuidModel.DefaultDeserializer.Date,
      updatedAt: UuidModel.DefaultDeserializer.Date
    } as any;
  }
}

User.registerSerializer();


type Test = FilterAttributes<Post, ModelLinker<User>>;