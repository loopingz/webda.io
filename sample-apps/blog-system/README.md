# Blog System - Complete Real-World Example

This sample demonstrates **all the power of @webda/models** in a complete, real-world blog application.

## Features Demonstrated

### 1. Complex Domain Model
- **User** - Authors and readers
- **Post** - Blog posts with rich content
- **Comment** - Nested comments on posts
- **Tag** - Categorization with many-to-many
- **PostTag** - Join table with composite primary key
- **UserFollow** - Self-referential relationships

### 2. All Relationship Types
- **OneToMany**: User → Posts, Post → Comments
- **ManyToOne**: Post → User (author), Comment → Post
- **ManyToMany**: Post ↔ Tag (via PostTag join table)
- **Self-Referential**: User ↔ User (followers/following)

### 3. Composite Primary Keys
The `PostTag` join table demonstrates composite keys:
```typescript
class PostTag extends Model {
  [WEBDA_PRIMARY_KEY] = ["postUuid", "tagUuid"] as const;

  postUuid: string;
  tagUuid: string;
}

// Type-safe composite key access
const pk = postTag.getPrimaryKey();
console.log(pk.postUuid, pk.tagUuid); // ✅ Fully typed
```

### 4. Validation
All models have comprehensive validation:
- Email format validation
- String length constraints
- Numeric ranges
- Pattern matching (slugs, URLs)
- Array constraints

### 5. Dirty Tracking
Automatic change detection:
```typescript
const post = await Post.ref("post-123").get();
post.title = "Updated Title";

// Webda tracks that 'title' field changed
const dirtyFields = post.getDirtyFields();
console.log(dirtyFields); // ["title"]

await post.save(); // Only updates changed fields
```

### 6. Repository Pattern
- Clean separation between models and storage
- Swappable storage backends (Memory, DynamoDB, MongoDB, etc.)
- Type-safe queries and operations

### 7. Lazy Loading
Relations are fetched on-demand for performance:
```typescript
const post = await Post.ref("post-123").get();
// post.comments not loaded yet

const comments = await post.comments.get();
// NOW comments are fetched
```

## Domain Model

```
┌─────────────┐
│    User     │
├─────────────┤
│ uuid        │───┐
│ username    │   │
│ email       │   │ Contains (OneToMany)
│ bio         │   │
└─────────────┘   │
      ↑           │
      │           ↓
      │     ┌──────────┐
      │     │   Post   │
      │     ├──────────┤
      │     │ uuid     │───┐
      │     │ title    │   │ Contains (OneToMany)
      │     │ content  │   │
      │     │ slug     │   │
      │     │ author   │   ↓
      │     └──────────┘  ┌──────────┐
      │           ↑       │ Comment  │
      │           │       ├──────────┤
      │           │       │ uuid     │
      │           │       │ content  │
      │           │       │ author   │
      │           │       │ post     │
      │           │       └──────────┘
      │           │
      │           │ ManyToMany via PostTag
      │           │
      │           ↓
      │     ┌──────────┐         ┌──────────┐
      │     │ PostTag  │─────────│   Tag    │
      │     ├──────────┤         ├──────────┤
      │     │ postUuid │ (FK)    │ uuid     │
      │     │ tagUuid  │ (FK)────│ name     │
      │     └──────────┘         │ slug     │
      │    (Composite PK)        └──────────┘
      │
      │     ┌─────────────┐
      └────→│ UserFollow  │
            ├─────────────┤
            │ followerUuid│──┐
            │ followingUuid  │ (Self-referential)
            └─────────────┘  │
            (Composite PK)   │
                             ↓
                        (Back to User)
```

## Running the Sample

```bash
npm install
npm run dev
```

This will:
1. Build and generate schemas via @webda/compiler
2. Create a complete blog with users, posts, comments, and tags
3. Demonstrate all CRUD operations
4. Show relationship queries
5. Display dirty tracking
6. Example queries and filtering

## What You'll Learn

1. **Domain Modeling**: How to structure complex domains with @webda/models
2. **Relationships**: All relationship types in practice
3. **Composite Keys**: When and how to use them (join tables)
4. **Self-Referential Relations**: User following system
5. **Validation**: Comprehensive validation in action
6. **Repository Pattern**: Clean architecture principles
7. **Performance**: Lazy loading and efficient queries
8. **Type Safety**: Full compile-time safety throughout

## Code Structure

```
src/
├── models/
│   ├── User.ts           - User model with followers/following
│   ├── Post.ts           - Blog post model
│   ├── Comment.ts        - Comment model
│   ├── Tag.ts            - Tag model
│   ├── PostTag.ts        - Join table (composite PK)
│   └── UserFollow.ts     - Follow relationship (composite PK)
├── repositories/
│   └── setup.ts          - Repository initialization
└── index.ts              - Complete demo scenarios

```

## Key Implementation Details

### Composite Primary Key Example

```typescript
class PostTag extends Model {
  [WEBDA_PRIMARY_KEY] = ["postUuid", "tagUuid"] as const;

  postUuid!: string;
  tagUuid!: string;

  // Type inference in action:
  // getPrimaryKey() returns Pick<PostTag, "postUuid" | "tagUuid">
  // Full IDE autocomplete on pk.postUuid and pk.tagUuid
}
```

### Self-Referential Relationship

```typescript
class UserFollow extends Model {
  [WEBDA_PRIMARY_KEY] = ["followerUuid", "followingUuid"] as const;

  followerUuid!: string;  // Who is following
  followingUuid!: string; // Who is being followed

  follower!: BelongTo<User>;
  following!: BelongTo<User>;
}

// User gains followers/following relations:
User.prototype.followers = undefined as any as Contains<UserFollow[]>;
User.prototype.following = undefined as any as Contains<UserFollow[]>;
```

### Dirty Tracking

```typescript
const post = await Post.ref("post-123").get();
console.log(post.isDirty()); // false

post.title = "New Title";
console.log(post.isDirty()); // true
console.log(post.getDirtyFields()); // ["title"]

await post.save(); // Efficient - only updates 'title'
console.log(post.isDirty()); // false again
```

This is a **production-ready** example showing best practices for building complex applications with @webda/models.
