import { UuidModel } from "../src/model";
import { BelongTo, ManyToMany, ManyToOne, ModelRef, ModelRelated, OneToMany, RelateTo } from "../src/relations";

/** Social network user with friendships, posts, comments, and preferences. */
class User extends UuidModel {
  friendships: ModelRelated<Friendship, "user2" | "user1">;
  posts: ModelRelated<Post, "user">;
  comments: ModelRelated<Comment, "user">;
  preferences: ModelRelated<Preferences, "user">;

  /** Get pending friendship requests addressed to this user. */
  get pendingFriendRequest() {
    return this.friendships.query("status = 'pending' AND invitedBy = ?");
  }

  /** Get accepted friendships for this user. */
  get friends() {
    return this.friendships.query("status = 'accepted'");
  }
}

/** User preferences linked to a single user. */
class Preferences extends UuidModel {
  user: BelongTo<User>;
}

/** User post with comments and many-to-many category associations. */
class Post extends UuidModel {
  title: string;
  content: string;
  user: RelateTo<User>;
  comments: ModelRelated<Comment, "post">;
  categories: ManyToMany<Category>;
}

/** Post category with back-references to associated posts. */
class Category extends UuidModel {
  name: string;
  posts: ModelRelated<Post, "categories">;
}

/** Comment on a post, authored by a user. */
class Comment extends UuidModel {
  content: string;
  post: RelateTo<Post>;
  user: RelateTo<User>;
}

/** Bidirectional friendship between two users with status tracking. */
class Friendship extends UuidModel {
  user1: RelateTo<User>;
  user2: RelateTo<User>;
  status: "pending" | "accepted" | "rejected";
  invitedBy: RelateTo<User>;
  createdAt: Date;
  updatedAt: Date;
  acceptedAt: Date;
  rejectedAt: Date;
}

const geek = new Category();
new Post().categories.push(geek);
geek.posts.query("title = 'test'");
