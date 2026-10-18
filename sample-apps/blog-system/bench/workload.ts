import type { SeededRandom } from "@webda/bench";
import type { BlogDataset } from "./seed.js";
import type { BlogBench } from "./blog.js";

/**
 * One operation of a blog visitor or author
 */
export interface BlogOperation {
  /**
   * Operation name, the scenario is `blog.domain.<name>`
   */
  name: string;
  /**
   * Weight in the mix
   */
  weight: number;
  /**
   * Run the operation: throws on an error status
   *
   * @param bench - runs the requests
   * @param data - seeded data
   * @param rng - random generator
   * @param index - unique index of the operation
   */
  run(bench: BlogBench, data: BlogDataset, rng: SeededRandom, index: number): Promise<void>;
}

/**
 * Operations of the blog workload and their weight in the mix: mostly reads, like a real blog
 */
export const BLOG_OPERATIONS: BlogOperation[] = [
  {
    // Home page: latest published posts, anonymous (Post.getPermissionQuery filters the store query)
    name: "feed",
    weight: 35,
    run: async bench => {
      await bench.expectOk("PUT", "/posts", { q: "status = 'published' ORDER BY publishedAt DESC LIMIT 20" });
    }
  },
  {
    // Post page: the post and its comments
    name: "readPost",
    weight: 30,
    run: async (bench, data, rng) => {
      const slug = data.published[rng.int(data.published.length)];
      await bench.expectOk("GET", `/posts/${slug}`);
      await bench.expectOk("PUT", "/comments", { q: `post = '${slug}' LIMIT 20` });
    }
  },
  {
    // Tag page: the posts of a tag
    name: "tagPage",
    weight: 10,
    run: async (bench, data, rng) => {
      await bench.expectOk("PUT", "/postTags", { q: `tag = '${data.tags[rng.int(data.tags.length)]}' LIMIT 20` });
    }
  },
  {
    // Author page: the user and its followers
    name: "profile",
    weight: 5,
    run: async (bench, data, rng) => {
      const user = data.users[rng.int(data.users.length)];
      await bench.expectOk("GET", `/users/${user}`);
      await bench.expectOk("PUT", "/userFollows", { q: `following = '${user}' LIMIT 20` });
    }
  },
  {
    // A logged-in reader comments a post: the author is set from the session
    name: "comment",
    weight: 10,
    run: async (bench, data, rng, index) => {
      await bench.expectOk(
        "POST",
        "/comments",
        { content: `Benchmark comment ${index}`, post: data.published[rng.int(data.published.length)] },
        data.users[rng.int(data.users.length)]
      );
    }
  },
  {
    // An author writes a draft, kept for the publish operation
    name: "draft",
    weight: 5,
    run: async (bench, data, rng, index) => {
      const author = data.users[rng.int(data.users.length)];
      const slug = `bench-draft-${process.pid}-${index}-${rng.int(1e9)}`;
      await bench.expectOk(
        "POST",
        "/posts",
        {
          title: `Benchmark draft ${index}`,
          slug,
          content: `Draft content written by the benchmark, operation ${index}.`,
          status: "draft",
          viewCount: 0
        },
        author
      );
      data.drafts.set(author, [...(data.drafts.get(author) ?? []), slug]);
    }
  },
  {
    // An author publishes one of its drafts
    name: "publish",
    weight: 3,
    run: async (bench, data, rng) => {
      const authors = [...data.drafts.keys()].filter(author => data.drafts.get(author).length > 0);
      const author = authors[rng.int(authors.length)];
      const slug = data.drafts.get(author)[rng.int(data.drafts.get(author).length)];
      await bench.expectOk("PUT", `/posts/${slug}/publish`, { destination: "twitter" }, author);
    }
  },
  {
    // A reader follows an author it does not follow yet (the seed follows the next users only)
    name: "follow",
    weight: 2,
    run: async (bench, data, rng) => {
      const follower = rng.int(data.users.length);
      const target =
        (follower + data.users.length - 1 - rng.int(Math.max(1, data.users.length / 2))) % data.users.length;
      if (target === follower) return;
      await bench.expectOk(
        "PUT",
        `/users/${data.users[follower]}/follow`,
        { target: data.users[target] },
        data.users[follower]
      );
    }
  }
];

/**
 * Pick an operation according to the weights
 *
 * @param rng - random generator
 * @returns the operation
 */
export function pickOperation(rng: SeededRandom): BlogOperation {
  const total = BLOG_OPERATIONS.reduce((sum, op) => sum + op.weight, 0);
  let draw = rng.next() * total;
  for (const op of BLOG_OPERATIONS) {
    draw -= op.weight;
    if (draw < 0) return op;
  }
  return BLOG_OPERATIONS[BLOG_OPERATIONS.length - 1];
}
