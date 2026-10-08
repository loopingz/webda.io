import { UuidModel, OneToMany, WEBDA_EVENTS, ModelEvents } from "@webda/models";
import bcrypt from "bcryptjs";
import type { Post } from "./Post.model.js";
import type { Comment } from "./Comment.model.js";
import type { UserFollow } from "./UserFollow.model.js";
import { Operation, useContext, WebdaError } from "@webda/core";
import type { IOperationContext, OperationContext } from "@webda/core";
import { bind } from "@webda/ql";

/**
 * Events emitted by users, on top of the model events
 */
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
 *
 * Permission model (see `canAct` below):
 * - anyone may read a profile (username, name, bio, website); the email is shown to its owner only;
 * - accounts are created with the `register` operation, which hashes the password; `POST /users` is refused;
 * - a user may update, delete, follow and unfollow with its own account only;
 * - the password hash (`__password`) and the email (`__email`) are private fields: never sent to clients, never
 *   taken from client input (`__` attributes are stripped from every input).
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
   * Password hash (bcrypt): private, see `register` and `changePassword`
   */
  __password?: string;

  /**
   * Email address: private, used to log in; shown to the owner only (see `toJSON`)
   * @format email
   */
  __email?: string;

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

  /**
   * The one permission entry point: the framework asks the static form for every client request
   *
   * - `object` is undefined for a static operation (`register`, `login`, `logout`): open to everyone;
   * - otherwise the instance rule below decides for that user.
   * @param context - the caller context
   * @param action - the action
   * @param object - the user, undefined for a static operation
   * @returns true or the refusal reason
   */
  static canAct(
    context: IOperationContext,
    action: string,
    object?: User
  ): Promise<boolean | string> | boolean | string {
    if (object === undefined) {
      return ["register", "login", "logout"].includes(action) ? true : "Unknown operation";
    }
    return super.canAct(context, action, object);
  }

  /**
   * Instance rule: profiles are public, everything else is the account owner's
   * @param context - the caller context
   * @param action - the action
   * @returns true or the refusal reason
   */
  async canAct(context: IOperationContext, action: string): Promise<boolean | string> {
    if (action === "get") {
      return true;
    }
    if (action === "create") {
      return "Use the register operation";
    }
    // update, delete, follow, unfollow, changePassword
    return context.getCurrentUserId() === this.getUUID() ? true : "Only the account owner";
  }

  /**
   * Client representation: private fields are never sent; the email is added for the owner only
   * @returns the public user
   */
  toJSON(): any {
    const { __password: _hash, __email: email, ...profile } = this as any;
    let viewer: string | undefined;
    try {
      viewer = useContext()?.getCurrentUserId();
    } catch {
      // Outside a request: public view
    }
    return viewer === this.getUUID() ? { ...profile, email } : profile;
  }

  /**
   * @param password - the clear password
   */
  setPassword(password: string): void {
    this.__password = bcrypt.hashSync(password, 10);
  }

  /**
   * @param password - the clear password
   * @returns true when it matches the stored hash
   */
  verifyPassword(password: string): boolean {
    return !!this.__password && bcrypt.compareSync(password, this.__password);
  }

  /**
   * Find a user by email (server-side query: private fields can be queried here, not by clients)
   * @param email - the email
   * @returns the user, if any
   */
  static async findByEmail(email: string): Promise<User | undefined> {
    // bind() escapes the value: it can never change the query structure
    return (await User.query(bind("__email = ?", [email]))).results.pop();
  }

  /**
   * Create an account: the only way to set a password. Open to everyone (static `canAct`)
   * @param username - the username
   * @param email - the email, must be unused
   * @param name - the full name
   * @param password - the clear password
   * @returns the new user, logged in
   */
  @Operation()
  static async register(username: string, email: string, name: string, password: string): Promise<User> {
    if (!email || !password || password.length < 8) {
      throw new WebdaError.BadRequest("Email and a password of at least 8 characters are required");
    }
    // Both are unique: the email identifies the account, the username is shown on posts
    if (await User.findByEmail(email)) {
      throw new WebdaError.Conflict("Email already registered");
    }
    if ((await User.query(bind("username = ?", [username]))).results.length) {
      throw new WebdaError.Conflict("Username already taken");
    }
    const user = new User();
    user.username = username;
    user.name = name;
    user.__email = email;
    user.setPassword(password);
    user.createdAt = new Date();
    user.updatedAt = user.createdAt;
    await user.save();
    // The new account is logged in
    useContext().getSession()?.login(user.getUUID(), "email");
    return user;
  }

  /**
   * Log in: verify the password and open the session
   * @param email - the email
   * @param password - the clear password
   * @returns true
   */
  @Operation()
  static async login(email: string, password: string): Promise<boolean> {
    const user = await User.findByEmail(email);
    if (!user || !user.verifyPassword(password)) {
      throw new WebdaError.Forbidden("Invalid email or password");
    }
    useContext().getSession()?.login(user.getUUID(), "email");
    await User.getRepository().emit("Login", { user });
    return true;
  }

  /**
   * Log out: close the session
   */
  @Operation()
  static async logout(): Promise<void> {
    const context = useContext();
    if (!context.getCurrentUserId()) {
      throw new WebdaError.Unauthorized("Not authenticated");
    }
    await User.getRepository().emit("Logout", { user: await context.getCurrentUser() });
    context.getSession()?.logout();
  }

  /**
   * Change the password: the account owner only (instance rule), with the current password
   *
   * Instance operations receive their input through the context: `PUT /users/{uuid}/changePassword {current, next}`
   */
  @Operation()
  async changePassword(): Promise<void> {
    const { current, next } = await useContext<OperationContext<{ current: string; next: string }>>().getInput();
    if (!this.verifyPassword(current)) {
      throw new WebdaError.Forbidden("Invalid password");
    }
    if (!next || next.length < 8) {
      throw new WebdaError.BadRequest("A password of at least 8 characters is required");
    }
    this.setPassword(next);
    await this.save();
  }

  /**
   * The user named by the operation input `{target}`
   * @returns the target user
   */
  private async targetUser(): Promise<User> {
    const { target } = await useContext<OperationContext<{ target: string }>>().getInput();
    try {
      return await User.ref(target).get();
    } catch {
      throw new WebdaError.NotFound("Unknown user");
    }
  }

  /**
   * Follow a user: the account owner only (instance rule). `PUT /users/{uuid}/follow {target}`
   * @returns true
   */
  @Operation()
  async follow(): Promise<true> {
    const target = await this.targetUser();
    if (target.getUUID() === this.getUUID()) {
      throw new WebdaError.BadRequest("Cannot follow yourself");
    }
    const existing = (await this.following.query(bind("following = ?", [target.getUUID()]))).results.pop();
    if (existing) {
      throw new WebdaError.BadRequest("Already following this user");
    }
    this.emit("Follow", {
      user: this,
      target
    });
    return true;
  }

  /**
   * Unfollow a user: the account owner only (instance rule). `PUT /users/{uuid}/unfollow {target}`
   */
  @Operation()
  async unfollow(): Promise<void> {
    const target = await this.targetUser();
    const existing = (await this.following.query(bind("following = ?", [target.getUUID()]))).results.pop();
    if (!existing) {
      throw new WebdaError.BadRequest("Not following this user");
    }
    await existing.delete();
    this.emit("Unfollow", {
      user: this,
      target
    });
  }
}
