import {
  Model,
  UuidModel,
  WEBDA_PRIMARY_KEY,
  registerRepository,
  MemoryRepository,
  // Semantic aliases (recommended)
  Contains,
  BelongTo,
  RelateTo,
  OneToOne as OneToOneRelation,
  // Technical aliases (alternative)
  OneToMany,
  ManyToOne,
  ManyToMany
} from "@webda/models";

/**
 * Example 1: OneToMany / ManyToOne (Parent-Child)
 *
 * Semantic: User "Contains" many Posts, Post "BelongTo" User
 * Technical: User "OneToMany" Posts, Post "ManyToOne" User
 *
 * This is the most common relationship pattern.
 */
class User extends UuidModel {
  name!: string;
  email!: string;

  // Semantic alias: User contains many posts
  posts!: Contains<Post>;

  // Could also use technical alias:
  // posts!: OneToMany<Post[]>;
}

class Post extends UuidModel {
  title!: string;
  content!: string;
  createdAt!: Date;

  // Semantic alias: Post belongs to User
  author!: BelongTo<User>;

  // Could also use technical alias:
  // author!: ManyToOne<User>;

  // A post also has many comments
  comments!: Contains<Comment>;

  // And relates to many tags
  tags!: RelateTo<Tag>;
}

/**
 * Example 2: Nested OneToMany
 *
 * Comments belong to Posts (which belong to Users)
 */
class Comment extends UuidModel {
  content!: string;
  createdAt!: Date;

  // Comment belongs to Post
  post!: BelongTo<Post>;

  // Comment belongs to User (the commenter)
  author!: BelongTo<User>;
}

/**
 * Example 3: ManyToMany
 *
 * Posts and Tags have a many-to-many relationship.
 * A post can have multiple tags, and a tag can be on multiple posts.
 */
class Tag extends UuidModel {
  name!: string;
  slug!: string;

  // Semantic alias: Tag relates to many posts
  posts!: RelateTo<Post[]>;

  // Could also use technical alias:
  // posts!: ManyToMany<Post[]>;
}

/**
 * Example 4: OneToOne
 *
 * User has one UserProfile, and UserProfile belongs to one User.
 */
class UserProfile extends UuidModel {
  bio!: string;
  avatar!: string;
  website!: string;

  // OneToOne relationship back to User
  user!: OneToOneRelation<User>;
}

// Extend User with profile relation
User.prototype.profile = undefined as any as OneToOneRelation<UserProfile>;

// Register serializers
User.registerSerializer();
Post.registerSerializer();
Comment.registerSerializer();
Tag.registerSerializer();
UserProfile.registerSerializer();

// Setup repositories
function setupRepositories() {
  registerRepository(User, new MemoryRepository(User, ["uuid"]));
  registerRepository(Post, new MemoryRepository(Post, ["uuid"]));
  registerRepository(Comment, new MemoryRepository(Comment, ["uuid"]));
  registerRepository(Tag, new MemoryRepository(Tag, ["uuid"]));
  registerRepository(UserProfile, new MemoryRepository(UserProfile, ["uuid"]));
}

async function demonstrateOneToMany() {
  console.log("\n=== Example 1: OneToMany / ManyToOne ===\n");

  // Create a user
  const alice = await User.create({
    uuid: "user-alice",
    name: "Alice Johnson",
    email: "alice@example.com"
  });

  console.log("Created user:", alice.name);

  // Create posts for Alice
  const post1 = await Post.create({
    uuid: "post-1",
    title: "My First Post",
    content: "Hello, world!",
    createdAt: new Date()
  });

  const post2 = await Post.create({
    uuid: "post-2",
    title: "TypeScript Tips",
    content: "Here are some TypeScript tips...",
    createdAt: new Date()
  });

  console.log("Created posts:", post1.title, ",", post2.title);

  // Link posts to user - note the bidirectional sync
  await post1.author.set(alice);
  await post2.author.set(alice);

  console.log("\nLinked posts to user");

  // Lazy loading: posts are fetched on demand
  console.log("Fetching user's posts (lazy loaded)...");
  const alicePosts = await alice.posts.get();

  console.log(`Alice has ${alicePosts.length} posts:`);
  for (const post of alicePosts) {
    console.log(`  - ${post.title}`);
  }

  // Get the author of a post
  const author = await post1.author.get();
  console.log(`\nAuthor of "${post1.title}":`, author?.name);
}

async function demonstrateNestedRelations() {
  console.log("\n=== Example 2: Nested Relations (Comments) ===\n");

  // Get existing post and user
  const alice = await User.ref("user-alice").get();
  const post1 = await Post.ref("post-1").get();

  if (!alice || !post1) {
    console.log("⚠️  Run Example 1 first");
    return;
  }

  // Create another user to comment
  const bob = await User.create({
    uuid: "user-bob",
    name: "Bob Smith",
    email: "bob@example.com"
  });

  // Create comments
  const comment1 = await Comment.create({
    uuid: "comment-1",
    content: "Great post!",
    createdAt: new Date()
  });

  const comment2 = await Comment.create({
    uuid: "comment-2",
    content: "Thanks for sharing!",
    createdAt: new Date()
  });

  // Link comments to post and authors
  await comment1.post.set(post1);
  await comment1.author.set(bob);

  await comment2.post.set(post1);
  await comment2.author.set(alice);

  console.log("Created 2 comments on the post");

  // Get all comments for the post
  const postComments = await post1.comments.get();
  console.log(`\nPost "${post1.title}" has ${postComments.length} comments:`);

  for (const comment of postComments) {
    const commentAuthor = await comment.author.get();
    console.log(`  - ${commentAuthor?.name}: "${comment.content}"`);
  }
}

async function demonstrateManyToMany() {
  console.log("\n=== Example 3: ManyToMany (Tags) ===\n");

  // Create tags
  const jsTag = await Tag.create({
    uuid: "tag-javascript",
    name: "JavaScript",
    slug: "javascript"
  });

  const tsTag = await Tag.create({
    uuid: "tag-typescript",
    name: "TypeScript",
    slug: "typescript"
  });

  const webTag = await Tag.create({
    uuid: "tag-web",
    name: "Web Development",
    slug: "web-development"
  });

  console.log("Created 3 tags:", jsTag.name, ",", tsTag.name, ",", webTag.name);

  // Get posts
  const post1 = await Post.ref("post-1").get();
  const post2 = await Post.ref("post-2").get();

  if (!post1 || !post2) {
    console.log("⚠️  Run Example 1 first");
    return;
  }

  // Add tags to posts (many-to-many relationship)
  await post1.tags.add(jsTag);
  await post1.tags.add(webTag);

  await post2.tags.add(tsTag);
  await post2.tags.add(jsTag);
  await post2.tags.add(webTag);

  console.log("\nTagged the posts");

  // Get tags for a post
  const post1Tags = await post1.tags.get();
  console.log(`\n"${post1.title}" tags:`);
  for (const tag of post1Tags) {
    console.log(`  - ${tag.name}`);
  }

  // Get posts for a tag (reverse direction)
  const jsPosts = await jsTag.posts.get();
  console.log(`\nPosts tagged with "${jsTag.name}":`);
  for (const post of jsPosts) {
    console.log(`  - ${post.title}`);
  }

  // Remove a tag from a post
  await post1.tags.remove(webTag);
  const updatedTags = await post1.tags.get();
  console.log(`\nAfter removing "${webTag.name}", "${post1.title}" has ${updatedTags.length} tags`);
}

async function demonstrateOneToOne() {
  console.log("\n=== Example 4: OneToOne (User Profile) ===\n");

  const alice = await User.ref("user-alice").get();
  if (!alice) {
    console.log("⚠️  Run Example 1 first");
    return;
  }

  // Create a profile for Alice
  const profile = await UserProfile.create({
    uuid: "profile-alice",
    bio: "Software engineer passionate about TypeScript and web development",
    avatar: "https://example.com/avatars/alice.jpg",
    website: "https://alice.dev"
  });

  // Link profile to user (OneToOne)
  await profile.user.set(alice);

  console.log("Created profile for Alice");

  // Get user's profile
  const aliceProfile = await alice.profile.get();
  console.log("\nAlice's profile:");
  console.log("  Bio:", aliceProfile?.bio);
  console.log("  Website:", aliceProfile?.website);

  // Get user from profile (reverse direction)
  const profileOwner = await profile.user.get();
  console.log("\nProfile owner:", profileOwner?.name);
}

async function demonstrateQueryingRelations() {
  console.log("\n=== Advanced: Querying Relations ===\n");

  const alice = await User.ref("user-alice").get();
  if (!alice) {
    console.log("⚠️  Run Example 1 first");
    return;
  }

  // Query posts with conditions (if repository supports it)
  console.log("Querying Alice's posts...");
  const allPosts = await alice.posts.query("");

  console.log(`Found ${allPosts.results.length} posts`);

  // Iterate through posts (efficient for large datasets)
  console.log("\nIterating through posts:");
  let count = 0;
  for await (const post of alice.posts.iterate()) {
    count++;
    console.log(`  ${count}. ${post.title}`);
  }

  // Count posts
  const postCount = await alice.posts.count();
  console.log(`\nTotal post count: ${postCount}`);
}

async function demonstrateRelationOperations() {
  console.log("\n=== Advanced: Relation Operations ===\n");

  const alice = await User.ref("user-alice").get();
  const post1 = await Post.ref("post-1").get();

  if (!alice || !post1) {
    console.log("⚠️  Run Example 1 first");
    return;
  }

  // Check if a post exists in the relation
  const isAlicePost = await alice.posts.has(post1);
  console.log(`Is "${post1.title}" Alice's post?`, isAlicePost);

  // Get relation metadata
  const posts = await alice.posts.get();
  console.log(`\nAlice has ${posts.length} posts`);

  // Relations support array-like operations
  console.log("\nPost titles:");
  posts.forEach((post, index) => {
    console.log(`  ${index + 1}. ${post.title}`);
  });
}

async function main() {
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║  @webda/models - Relations Demo                               ║");
  console.log("║  Showcasing All Relationship Types with Type Safety           ║");
  console.log("╚════════════════════════════════════════════════════════════════╝");

  setupRepositories();

  try {
    await demonstrateOneToMany();
    await demonstrateNestedRelations();
    await demonstrateManyToMany();
    await demonstrateOneToOne();
    await demonstrateQueryingRelations();
    await demonstrateRelationOperations();

    console.log("\n✅ All examples completed successfully!");
    console.log("\nKey Takeaways:");
    console.log("• Semantic aliases (Contains, BelongTo, RelateTo) are intuitive and recommended");
    console.log("• Relations are lazy-loaded for performance");
    console.log("• Bidirectional sync keeps relationships consistent");
    console.log("• Full type safety with IDE autocomplete");
    console.log("• Support for nested relations (comments on posts on users)");
    console.log("• ManyToMany relationships work seamlessly");
    console.log("• Query and iterate efficiently over large relation sets\n");

  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
