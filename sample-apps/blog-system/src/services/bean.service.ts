import { Bean, InstanceCache, Operation, RestParameters, Service, ServiceName, useApplication, useLog, useRepository } from "@webda/core";
import { User } from "../models/User.model.js";
import { UserFollow } from "../models/UserFollow.model.js";
import { getCompletions, fieldsFromSchema, type CompletionField, type CompletionResult } from "@webda/ql";

export class TestBeanParameters extends Service.Parameters {
  service: ServiceName;
}

@Bean
export class TestBean<T extends TestBeanParameters = TestBeanParameters> extends Service<T> {

  @InstanceCache
  getVersion(): string {
    return useApplication().getPackageDescription().name;
  }

  /**
   * Get the version of the application
   * @returns version of the application
   */
  @Operation<RestParameters>({ id: "Version.Get", rest: { method: "get", path: "/version" }, description: "Get the version of the application" })
  async version() : Promise<string> {
    return this.getVersion();
  }

  @Operation
  async testOperation(counter: number): Promise<string> {
    useLog("INFO", `Test operation called with counter: ${counter}`);
    return counter.toString(16);
  }

  /**
   * Log what the type system infers for primary keys, relations and queries
   */
  @Operation
  async demonstrateTypeSafety(): Promise<{ ok: true }> {
    console.log("🔒 Type Safety Features:\n");

    // 1. Single primary key returns string. MemoryRepository.get throws when the
    // row is missing, so catch it — this runs as a demo against arbitrary state.
    try {
      const user = await User.ref("user-alice").get();
      if (user) {
        const userPk = user.getPrimaryKey();
        console.log("1. Single Primary Key:");
        console.log(`   user.getPrimaryKey() returns: string`);
        console.log(`   Value: "${userPk}"`);
        console.log(`   Type: ${typeof userPk}\n`);
      }
    } catch {
      useLog("INFO", "1. Single Primary Key: (user 'user-alice' not present — skipping sample)");
    }

    // 2. Composite primary key returns object
    try {
      const userFollow = await UserFollow.ref({
        follower: "user-alice",
        following: "user-bob"
      }).get();
      if (userFollow) {
        const followPk = userFollow.getPrimaryKey();
        console.log("2. Composite Primary Key:");
        console.log(`   userFollow.getPrimaryKey() returns: Pick<UserFollow, "follower" | "following">`);
        console.log(`   follower: "${followPk.follower}"`);
        console.log(`   following: "${followPk.following}"`);
        console.log(`   toString(): "${followPk.toString()}"\n`);
      }
    } catch {
      useLog("INFO", "2. Composite Primary Key: (userFollow not present — skipping sample)");
    }

    // 3. Relations are fully typed
    console.log("3. Type-Safe Relations:");
    console.log(`   user.posts.get() returns: Promise<Post[]>`);
    console.log(`   post.author.get() returns: Promise<User | undefined>`);
    console.log(`   post.tags.get() returns: Promise<Tag[]>`);
    console.log(`   ✅ Full IDE autocomplete and compile-time checking!\n`);

    // 4. Query results are typed
    console.log("4. Type-Safe Queries:");
    console.log(`   User.query("") returns: Promise<{ results: User[]; continuationToken?: string }>`);
    console.log(`   ✅ Results are properly typed User instances\n`);

    console.log("💡 All of this type safety happens at compile time with zero runtime overhead!");
    return { ok: true };
  }

  /**
   * Get WebdaQL code completion suggestions for a given query and caret offset
   */
  @Operation<RestParameters>({
    id: "QL.Complete",
    rest: { method: "post", path: "/ql/complete" },
    description: "Get WebdaQL code completion suggestions"
  })
  async completeQL(query: string = "", caret?: number, model: string = "WebdaSample/Post"): Promise<CompletionResult> {
    const app = useApplication();
    let fields: CompletionField[] = [];
    try {
      const modelClass = app.getModel(model);
      if (modelClass) {
        try {
          const repo: any = useRepository(modelClass as any);
          if (repo && typeof repo.getCompletionFields === "function") {
            fields = repo.getCompletionFields();
          }
        } catch {
          // Fallback to schema reflection
        }
        if (fields.length === 0) {
          const meta: any = (modelClass as any)?.Metadata;
          const schema = meta?.Schemas?.Stored || meta?.Schemas?.Output || meta?.Schemas?.Input;
          if (schema) {
            fields = fieldsFromSchema(schema);
          }
        }
      }
    } catch {
      // Model not found
    }
    const offset = typeof caret === "number" ? caret : query.length;
    return getCompletions(query, offset, { fields, filterOnly: true });
  }
}
