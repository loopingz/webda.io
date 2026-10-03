import { suite, test } from "@webda/test";
import * as assert from "assert";
import { decodeCursor, encodeCursor, queryFor, ResourceRegistry } from "./resources.js";

const Post = { name: "Post" };
const Follow = { name: "UserFollow" };
const ops: any = {
  "Post.Get": { id: "Post.Get", input: "x", output: "y", method: "modelGet", context: { model: Post, pkFields: ["slug"] } },
  "Posts.Query": { id: "Posts.Query", input: "searchRequest", output: "z", method: "modelQuery", context: { model: Post } },
  "UserFollow.Get": { id: "UserFollow.Get", input: "x", output: "y", method: "modelGet", context: { model: Follow, pkFields: ["follower", "following"] } },
  "Post.Publish": { id: "Post.Publish", input: "x", output: "y", method: "publish" },
  "Secret.Get": { id: "Secret.Get", input: "x", output: "y", method: "modelGet", hidden: true, context: { model: {}, pkFields: ["id"] } },
  "Follow.Query": { id: "Follow.Query", input: "x", output: "z", method: "modelQuery", mcp: false, context: { model: Follow } }
};

@suite
class ResourceRegistryTest {
  @test
  buildsTemplatesFromGetOperations() {
    const registry = new ResourceRegistry(["*"]);
    registry.build(ops);
    assert.deepStrictEqual(
      registry.templates().map(t => t.uriTemplate),
      ["webda://Post/{slug}", "webda://UserFollow/{follower}/{following}"]
    );
    assert.strictEqual(registry.models().find(m => m.name === "Post").queryOperationId, "Posts.Query");
    assert.strictEqual(registry.models().find(m => m.name === "UserFollow").queryOperationId, undefined);
  }

  @test
  filtersModels() {
    const registry = new ResourceRegistry(["UserFollow"]);
    registry.build(ops);
    assert.deepStrictEqual(registry.models().map(m => m.name), ["UserFollow"]);
  }

  @test
  roundTripsEncodedSegments() {
    const registry = new ResourceRegistry(["*"]);
    registry.build(ops);
    const model = registry.models().find(m => m.name === "UserFollow");
    const uri = registry.uriFor(model, { follower: "a/b c", following: "é" });
    assert.strictEqual(uri, "webda://UserFollow/a%2Fb%20c/%C3%A9");
    assert.deepStrictEqual(registry.parse(uri), { model, key: { follower: "a/b c", following: "é" } });
  }

  @test
  rejectsUnknownOrMalformedUris() {
    const registry = new ResourceRegistry(["*"]);
    registry.build(ops);
    assert.strictEqual(registry.parse("webda://Nope/x"), undefined);
    assert.strictEqual(registry.parse("webda://Post/a/b"), undefined);
    assert.strictEqual(registry.parse("webda://Post/"), undefined);
    assert.strictEqual(registry.parse("https://Post/x"), undefined);
    assert.strictEqual(registry.parse("webda://Post/%E0%A4%A"), undefined);
  }

  @test
  cursorsRoundTrip() {
    assert.deepStrictEqual(decodeCursor(encodeCursor({ model: "Post", token: "abc" })), { model: "Post", token: "abc" });
    assert.strictEqual(decodeCursor(undefined), undefined);
    assert.strictEqual(decodeCursor("not-base64-json"), undefined);
  }

  @test
  rejectsCursorsWithInvalidToken() {
    assert.strictEqual(decodeCursor(encodeCursor({ model: "Post", token: 123 as any })), undefined);
    assert.strictEqual(decodeCursor(encodeCursor({ model: "Post", token: {} as any })), undefined);
    assert.strictEqual(decodeCursor(encodeCursor({ model: "Post", token: null as any })), undefined);
    assert.strictEqual(decodeCursor(encodeCursor({ model: "Post", token: [] as any })), undefined);
  }

  @test
  rejectsCursorsWithInvalidModel() {
    assert.strictEqual(decodeCursor(encodeCursor({ model: 123 as any })), undefined);
    assert.strictEqual(decodeCursor(encodeCursor({ model: {} as any })), undefined);
  }

  @test
  buildsQueries() {
    assert.strictEqual(queryFor(), "LIMIT 100");
    assert.strictEqual(queryFor('a"b'), 'LIMIT 100 OFFSET "a\\"b"');
    assert.strictEqual(queryFor("a\\b"), 'LIMIT 100 OFFSET "a\\\\b"');
    assert.strictEqual(queryFor("a\nb"), 'LIMIT 100 OFFSET "a\nb"');
  }

  @test
  skipsQueryWithMcpFalse() {
    const registry = new ResourceRegistry(["*"]);
    registry.build(ops);
    assert.strictEqual(registry.models().find(m => m.name === "UserFollow").queryOperationId, undefined);
  }
}
