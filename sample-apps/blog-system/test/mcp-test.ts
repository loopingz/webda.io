import { suite, test } from "@webda/test";
import * as assert from "assert";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const appDir = resolve(import.meta.dirname, "..");
const require = createRequire(join(appDir, "package.json"));
const cliJs = join(dirname(require.resolve("@webda/core/package.json")), "lib", "bin", "cli.js");

/**
 * Smoke test: `webda mcp` on the real blog application
 */
@suite
class BlogSystemMcpTest {
  @test
  async exposesBlogOperationsOverStdio() {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [cliJs, "mcp"],
      cwd: appDir,
      env: { ...process.env, NODE_ENV: "test" } as Record<string, string>,
      stderr: "pipe"
    });
    const client = new Client({ name: "blog-smoke", version: "1.0.0" });
    try {
      await client.connect(transport);
      const names = (await client.listTools()).tools.map(t => t.name);
      for (const expected of ["Post.Publish", "Post.Get", "Posts.Query", "User.Login"]) {
        assert.ok(names.includes(expected), `${expected} missing from ${names.join(", ")}`);
      }
      const templates = (await client.listResourceTemplates()).resourceTemplates.map(t => t.uriTemplate);
      assert.ok(templates.includes("webda://Post/{slug}"));
      assert.ok(templates.includes("webda://UserFollow/{follower}/{following}"));
      const missing = await client.callTool({ name: "Post.Get", arguments: { slug: "does-not-exist" } });
      assert.strictEqual(missing.isError, true);
    } finally {
      await client.close();
    }
  }
}
