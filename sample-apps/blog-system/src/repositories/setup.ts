import { registerRepository, MemoryRepository } from "@webda/models";
import { User } from "../models/User.model.js";
import { Post } from "../models/Post.model.js";
import { Comment } from "../models/Comment.model.js";
import { Tag } from "../models/Tag.model.js";
import { PostTag } from "../models/PostTag.model.js";
import { UserFollow } from "../models/UserFollow.model.js";

/**
 * Setup repositories for all models
 *
 * In a real application, you would use:
 * - DynamoDBRepository for AWS
 * - MongoRepository for MongoDB
 * - SQLRepository for PostgreSQL/MySQL
 *
 * Here we use MemoryRepository for demonstration purposes.
 */
export function setupRepositories() {
  // Single primary key models
  registerRepository(User, new MemoryRepository(User, ["uuid"]));
  registerRepository(Post, new MemoryRepository(Post, ["uuid"]));
  registerRepository(Comment, new MemoryRepository(Comment, ["uuid"]));
  registerRepository(Tag, new MemoryRepository(Tag, ["uuid"]));

  // Composite primary key models
  registerRepository(PostTag, new MemoryRepository(PostTag, ["postUuid", "tagUuid"]));
  registerRepository(UserFollow, new MemoryRepository(UserFollow, ["followerUuid", "followingUuid"]));
}
