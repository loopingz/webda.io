import { Model, UuidModel } from "../src/model";
import { BelongTo, ManyToMany, ManyToOne, ModelRef, ModelRelated, OneToMany, RelateTo } from "../src/relations";

class User extends UuidModel {
  friendships: ModelRelated<Friendship, "user2" | "user1">;
  posts: ModelRelated<Post, "user">;
  comments: ModelRelated<Comment, "user">;
  preferences: ModelRelated<Preferences, "user">;

  get pendingFriendRequest() {
    return this.friendships.query("status = 'pending' AND invitedBy = ?");
  }

  get friends() {
    return this.friendships.query("status = 'accepted'");
  }
}

class Preferences extends UuidModel {
  user: BelongTo<User>;
}

class Post extends UuidModel {
  title: string;
  content: string;
  user: RelateTo<User>;
  comments: ModelRelated<Comment, "post">;
  categories: ManyToMany<Category>;
}

class Category extends UuidModel {
  name: string;
  posts: ModelRelated<Post, "categories">;
}

class Comment extends UuidModel {
  content: string;
  post: RelateTo<Post>;
  user: RelateTo<User>;
}

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

new Post().categories.add(new Category());
new Category().posts.query("title = 'test'");
