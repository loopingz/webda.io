import { useModel } from "@webda/core";
import { useRepository } from "@webda/models";
import { parallel, SeededRandom } from "@webda/bench";

/**
 * Size of the seeded blog
 */
export interface BlogDatasetSize {
  /**
   * Users
   */
  users: number;
  /**
   * Posts, 80% published
   */
  posts: number;
  /**
   * Tags, each post has two
   */
  tags: number;
  /**
   * Comments on published posts
   */
  comments: number;
  /**
   * Follow relationships
   */
  follows: number;
}

/**
 * Dataset size per benchmark profile
 */
export const BLOG_DATASETS: Record<string, BlogDatasetSize> = {
  smoke: { users: 10, posts: 30, tags: 5, comments: 60, follows: 20 },
  quick: { users: 100, posts: 1000, tags: 20, comments: 2000, follows: 500 },
  full: { users: 1000, posts: 10000, tags: 100, comments: 50000, follows: 5000 }
};

/**
 * What the workload needs to know about the seeded data
 */
export interface BlogDataset {
  /**
   * Size of the dataset
   */
  size: BlogDatasetSize;
  /**
   * User ids
   */
  users: string[];
  /**
   * Slugs of the published posts
   */
  published: string[];
  /**
   * Slugs of the drafts by author, consumed by the publish operation
   */
  drafts: Map<string, string[]>;
  /**
   * Tag slugs
   */
  tags: string[];
}

/**
 * Parallelism of the seeding
 */
const SEED_CONCURRENCY = 20;

/**
 * Seed the blog through the repositories of the registered models
 *
 * The data is deterministic (seeded random), so two runs work on the same blog. Passwords are not set: hashing
 * them (bcrypt) would make the seeding minutes long, requests log the session in directly.
 *
 * @param size - dataset size
 * @param seed - seed of the random generator
 * @returns the dataset description
 */
export async function seedBlog(size: BlogDatasetSize, seed: number = 42): Promise<BlogDataset> {
  const rng = new SeededRandom(seed);
  // The classes registered by the application, not the ones of src/: they carry the metadata and the repository
  const repo = (name: string) => useRepository(useModel(name) as any) as any;
  const now = Date.now();
  const date = (offset: number) => new Date(now - offset * 60000);

  const users = Array.from({ length: size.users }, () => rng.uuid());
  await parallel(users.length, SEED_CONCURRENCY, i =>
    repo("WebdaSample/User").create({
      uuid: users[i],
      username: `user_${i}`,
      name: `Bench User ${i}`,
      bio: `Writer number ${i}`,
      createdAt: date(i),
      updatedAt: date(i)
    })
  );

  const tags = Array.from({ length: size.tags }, (_, i) => `tag-${i}`);
  await parallel(tags.length, SEED_CONCURRENCY, i =>
    repo("WebdaSample/Tag").create({ slug: tags[i], name: `Tag ${i}`, description: `Posts about topic ${i}` })
  );

  const published: string[] = [];
  const drafts = new Map<string, string[]>();
  const posts = Array.from({ length: size.posts }, (_, i) => ({
    slug: `post-${String(i).padStart(6, "0")}`,
    author: users[rng.int(users.length)],
    status: i % 5 === 4 ? "draft" : "published"
  }));
  await parallel(posts.length, SEED_CONCURRENCY, async i => {
    const post = posts[i];
    await repo("WebdaSample/Post").create({
      slug: post.slug,
      title: `Benchmark post number ${i}`,
      content: `Content of the benchmark post number ${i}. `.repeat(10),
      excerpt: `Excerpt of post ${i}`,
      status: post.status,
      viewCount: rng.int(1000),
      author: post.author,
      createdAt: date(i),
      updatedAt: date(i),
      ...(post.status === "published" ? { publishedAt: date(i) } : {})
    });
  });
  for (const post of posts) {
    if (post.status === "published") {
      published.push(post.slug);
    } else {
      drafts.set(post.author, [...(drafts.get(post.author) ?? []), post.slug]);
    }
  }

  await parallel(posts.length, SEED_CONCURRENCY, async i => {
    for (const tag of new Set([tags[i % tags.length], tags[(i * 7 + 3) % tags.length]])) {
      await repo("WebdaSample/PostTag").create({ post: posts[i].slug, tag, createdAt: date(i) });
    }
  });

  await parallel(size.comments, SEED_CONCURRENCY, i =>
    repo("WebdaSample/Comment").create({
      uuid: rng.uuid(),
      content: `Comment number ${i}`,
      post: published[rng.int(published.length)],
      author: users[rng.int(users.length)],
      isEdited: false,
      createdAt: date(i),
      updatedAt: date(i)
    })
  );

  // User i follows the next users: no duplicate pair, no self-follow
  const followsPerUser = Math.max(1, Math.ceil(size.follows / users.length));
  await parallel(
    Math.min(size.follows, users.length * Math.min(followsPerUser, users.length - 1)),
    SEED_CONCURRENCY,
    i => {
      const follower = Math.floor(i / followsPerUser);
      const following = (follower + 1 + (i % followsPerUser)) % users.length;
      return repo("WebdaSample/UserFollow").create({
        follower: users[follower],
        following: users[following],
        createdAt: date(i)
      });
    }
  );

  return { size, users, published, drafts, tags };
}
