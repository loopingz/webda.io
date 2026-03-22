import { UuidModel, OneToMany, WEBDA_EVENTS, ModelEvents } from "@webda/models";
import bcrypt from "bcryptjs";
import type { Post } from "./Post";
import type { Comment } from "./Comment";
import type { UserFollow } from "./UserFollow";
import { Operation, useContext, WebdaError } from "@webda/core";

export class Password {
  hashed!: string;

  set(value: string) {
    this.hashed = bcrypt.hashSync(value, 10);
  }

  verify(value: string): boolean {
    return bcrypt.compareSync(value, this.hashed);
  }

  toJSON(): string {
    return this.hashed;
  }

  toDto(): void {}
}

export class UserEvents<T extends User> {
  Login: {
    user: T;
  };
  Follow: {
    user: T;
    target: User;
  };
  Unfollow: {
    user: T;
    target: User;
  };
  Logout: {
    user: T;
  };
}

/**
 * User model representing blog authors and readers
 */
export class User extends UuidModel {
  [WEBDA_EVENTS]: ModelEvents<this> & UserEvents<this>;
  /**
   * Unique username
   * @minLength 3
   * @maxLength 30
   * @pattern ^[a-zA-Z0-9_]+$
   */
  username!: string;

  /**
   * User password
   */
  password!: Password;

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
   * @readonly
   */
  createdAt!: Date;

  /**
   * Last update date
   * @readonly
   */
  updatedAt!: Date;

  // Relations
  posts!: OneToMany<Post, User, "author">; // Posts authored by this user
  comments!: OneToMany<Comment, User, "author">;

  // Self-referential relations (populated via UserFollow)
  followers!: OneToMany<UserFollow, User, "following">; // Users who follow this user
  following!: OneToMany<UserFollow, User, "follower">; // Users this user follows

  @Operation()
  static async login(email: string, password: string): Promise<boolean> {
    const user = (await User.getRepository().query(`email = '${email}' LIMIT 1`)).results.pop();
    if (!user || !user.password.verify(password)) {
      throw new WebdaError.Forbidden("Invalid email or password");
    }
    // Should be able to emit
    await User.getRepository().emit("Login", {
      user
    });
    return true;
  }

  @Operation()
  static async logout(): Promise<void> {
    const context = useContext();
    if (!context.getCurrentUserId()) {
      throw new WebdaError.Unauthorized("Not authenticated");
    }
    if (context.getSession()["logout"]) {
      await User.getRepository().emit("Logout", {
        user: await context.getCurrentUser()
      });
      context.getSession()["logout"]?.();
    }
  }
}
