import { suite, test, timeout } from "@webda/test";
import * as assert from "assert";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const appDir = resolve(import.meta.dirname, "..");
const require = createRequire(join(appDir, "package.json"));
const cliJs = join(dirname(require.resolve("@webda/core/package.json")), "lib", "bin", "cli.js");

/**
 * Minimal environment for the child: nothing from the test runner leaks in
 * @returns the child environment
 */
function childEnv(): Record<string, string> {
  const env: Record<string, string> = { NODE_ENV: "test" };
  for (const name of ["PATH", "HOME", "TMPDIR", "SystemRoot"]) {
    if (process.env[name] !== undefined) {
      env[name] = process.env[name]!;
    }
  }
  return env;
}

/**
 * Smoke test: `webda mcp` on the real blog application, through the official SDK client
 */
@suite
class BlogSystemMcpTest {
  @test
  @timeout(60000)
  async exposesBlogOperationsOverStdio() {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [cliJs, "mcp", "--user", "mcp-smoke-test"],
      cwd: appDir,
      env: childEnv(),
      stderr: "pipe"
    });
    // Drain the child's stderr (logs); printed only when the test fails
    let stderr = "";
    transport.stderr?.on("data", chunk => (stderr += chunk));
    // stdout must only carry JSON-RPC frames: any unparsable line is reported here
    const protocolErrors: Error[] = [];
    const client = new Client({ name: "blog-smoke", version: "1.0.0" });
    client.onerror = err => protocolErrors.push(err);
    // The registry store persists to .registry: use a unique slug and delete it afterwards
    const slug = `mcp-smoke-${Date.now()}`;
    let created = false;
    try {
      await client.connect(transport);
      const tools = (await client.listTools()).tools;
      const names = tools.map(t => t.name);
      for (const expected of ["Post.Create", "Post.Get", "Posts.Query", "Post.Delete", "User.Login"]) {
        assert.ok(names.includes(expected), `${expected} missing from ${names.join(", ")}`);
      }
      assert.ok(tools.every(t => t.outputSchema === undefined), "tools must not declare an outputSchema");
      const templates = (await client.listResourceTemplates()).resourceTemplates.map(t => t.uriTemplate);
      assert.ok(templates.includes("webda://Post/{slug}"));
      assert.ok(templates.includes("webda://UserFollow/{follower}/{following}"));

      // Post.Create input comes from its tool inputSchema: slug, title and content (no author required)
      const createProps = Object.keys((tools.find(t => t.name === "Post.Create")!.inputSchema.properties ?? {}) as object);
      for (const field of ["slug", "title", "content"]) {
        assert.ok(createProps.includes(field), `Post.Create input lacks ${field}`);
      }
      const post = { slug, title: "MCP smoke test", content: "Created through the MCP stdio transport" };
      const create = await client.callTool({ name: "Post.Create", arguments: post });
      assert.notStrictEqual(create.isError, true, JSON.stringify(create.content));
      created = true;
      assert.strictEqual((create.structuredContent as any)?.slug, slug);

      const get = await client.callTool({ name: "Post.Get", arguments: { slug } });
      assert.notStrictEqual(get.isError, true, JSON.stringify(get.content));
      assert.strictEqual((get.structuredContent as any)?.title, post.title);

      const query = await client.callTool({ name: "Posts.Query", arguments: { query: `slug = '${slug}'` } });
      assert.notStrictEqual(query.isError, true, JSON.stringify(query.content));
      assert.deepStrictEqual(
        ((query.structuredContent as any)?.results ?? []).map((p: any) => p.slug),
        [slug]
      );

      const read = await client.readResource({ uri: `webda://Post/${slug}` });
      assert.strictEqual(JSON.parse((read.contents[0] as any).text).content, post.content);

      const missing = await client.callTool({ name: "Post.Get", arguments: { slug: "does-not-exist" } });
      assert.strictEqual(missing.isError, true);
      assert.deepStrictEqual(protocolErrors, []);
    } catch (err) {
      console.error(`webda mcp stderr:\n${stderr}`);
      throw err;
    } finally {
      if (created) {
        const deleted = await client.callTool({ name: "Post.Delete", arguments: { slug } }).catch(err => err);
        if (deleted instanceof Error || deleted.isError) {
          console.error(`Failed to delete smoke test post ${slug}`, deleted);
        }
      }
      await client.close();
    }
  }
}
