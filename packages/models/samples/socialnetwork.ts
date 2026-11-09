import { UuidModel } from "../src/model";
import { BelongTo, ManyToMany, ModelRelated, RelateTo } from "../src/relations";

/** Social network user with friendships, posts, comments, and preferences. */
class User extends UuidModel {
  /**
   * Friendships
   */
  friendships: ModelRelated<Friendship, "user2" | "user1">;
  /**
   * Posts
   */
  posts: ModelRelated<Post, "user">;
  /**
   * Comments
   */
  comments: ModelRelated<Comment, "user">;
  /**
   * Preferences
   */
  preferences: ModelRelated<Preferences, "user">;

  /**
   * Get pending friendship requests addressed to this user.
   * @returns pending friendship requests
   */
  get pendingFriendRequest() {
    return this.friendships.query("status = 'pending' AND invitedBy = ?");
  }

  /**
   * Get accepted friendships for this user.
   * @returns accepted friendships
   */
  get friends() {
    return this.friendships.query("status = 'accepted'");
  }
}

/** User preferences linked to a single user. */
class Preferences extends UuidModel {
  /**
   * User
   */
  user: BelongTo<User>;
}

/** User post with comments and many-to-many category associations. */
class Post extends UuidModel {
  /**
   * Title
   */
  title: string;
  /**
   * Content
   */
  content: string;
  /**
   * User
   */
  user: RelateTo<User>;
  /**
   * Comments
   */
  comments: ModelRelated<Comment, "post">;
  /**
   * Categories
   */
  categories: ManyToMany<Category>;
}

/** Post category with back-references to associated posts. */
class Category extends UuidModel {
  /**
   * Name
   */
  name: string;
  /**
   * Posts
   */
  posts: ModelRelated<Post, "categories">;
}

/** Comment on a post, authored by a user. */
class Comment extends UuidModel {
  /**
   * Content
   */
  content: string;
  /**
   * Post
   */
  post: RelateTo<Post>;
  /**
   * User
   */
  user: RelateTo<User>;
}

/** Bidirectional friendship between two users with status tracking. */
class Friendship extends UuidModel {
  /**
   * User1
   */
  user1: RelateTo<User>;
  /**
   * User2
   */
  user2: RelateTo<User>;
  /**
   * Status
   */
  status: "pending" | "accepted" | "rejected";
  /**
   * Invited by
   */
  invitedBy: RelateTo<User>;
  /**
   * Created at
   */
  createdAt: Date;
  /**
   * Updated at
   */
  updatedAt: Date;
  /**
   * Accepted at
   */
  acceptedAt: Date;
  /**
   * Rejected at
   */
  rejectedAt: Date;
}

const geek = new Category();
new Post().categories.push(geek);
geek.posts.query("title = 'test'");
