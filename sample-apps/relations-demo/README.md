# Relations Demo Sample

This sample demonstrates the powerful relationship system in @webda/models with **full type safety** and **semantic aliases**.

## Relationship Types

### Semantic Aliases (Recommended)

@webda/models provides intuitive, semantic names for relationships:

```typescript
// OneToMany - A parent has many children
class User extends Model {
  posts: Contains<Post[]>;  // User has many Posts
}

// ManyToOne - A child belongs to a parent
class Post extends Model {
  author: BelongTo<User>;   // Post belongs to User
}

// ManyToMany - Bidirectional many-to-many
class Post extends Model {
  tags: RelateTo<Tag[]>;    // Post relates to many Tags
}

class Tag extends Model {
  posts: RelateTo<Post[]>;  // Tag relates to many Posts
}

// OneToOne - Bidirectional one-to-one
class User extends Model {
  profile: OneToOne<UserProfile>;
}
```

### Technical Aliases

For those who prefer traditional ORM terminology:

- `OneToMany<T[]>` - One parent, many children
- `ManyToOne<T>` - Many children, one parent
- `ManyToMany<T[]>` - Bidirectional many-to-many
- `OneToOne<T>` - Bidirectional one-to-one

## Key Features

### 1. Lazy Loading

Relations are not loaded by default - they're fetched on demand:

```typescript
const user = await User.ref("user-123").get();
// user.posts is NOT loaded yet

const posts = await user.posts.get();
// NOW the posts are fetched from the repository
```

### 2. Type-Safe Operations

All relation operations are fully typed:

```typescript
// Add a post to user
await user.posts.add(post);

// Remove a post
await user.posts.remove(post);

// Query posts with filter
const recentPosts = await user.posts.query({ createdAt: { $gt: lastWeek } });

// Iterate through all posts
for await (const post of user.posts.iterate()) {
  console.log(post.title);
}
```

### 3. Bidirectional Sync

When you use semantic aliases, relations are automatically bidirectional:

```typescript
// Set the author on a post
await post.author.set(user);

// The post is automatically added to user.posts!
const userPosts = await user.posts.get();
// userPosts includes the post we just linked
```

## Running the Sample

```bash
npm install
npm run dev
```

## What You'll Learn

1. How to define all types of relationships
2. Semantic vs technical aliases (both are equivalent)
3. Lazy loading and on-demand queries
4. Bidirectional relationship sync
5. Type-safe relationship operations
6. Cascading deletes and orphan handling
