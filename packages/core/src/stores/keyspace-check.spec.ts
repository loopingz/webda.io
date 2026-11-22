import { suite, test } from "@webda/test";
import * as assert from "assert";
import { findKeyCollisions, type KeyspaceEntry } from "./keyspace-check.js";

/**
 * Build an entry
 * @param Identifier - model identifier
 * @param PrimaryKey - primary key fields
 * @param keyspace - keyspace the model is stored in
 * @param Ancestors - model ancestors
 * @returns the entry
 */
function entry(Identifier: string, PrimaryKey: string[], keyspace = "db", Ancestors: string[] = []): KeyspaceEntry {
  return { Identifier, PrimaryKey, Ancestors, keyspace };
}

@suite
class KeyspaceCheckTest {
  @test
  unrelatedNaturalKeysCollide() {
    const collisions = findKeyCollisions([
      entry("Blog/Post", ["slug"]),
      entry("Blog/Tag", ["slug"]),
      entry("Blog/User", ["uuid"])
    ]);
    assert.deepStrictEqual(collisions, [{ keyspace: "db", models: ["Blog/Post", "Blog/Tag"] }]);
  }

  @test
  differentKeyShapesStillCollide() {
    // `post_tag` and a slug can serialize to the same string: the shape does not protect the keyspace
    assert.deepStrictEqual(findKeyCollisions([entry("Blog/Tag", ["slug"]), entry("Blog/PostTag", ["post", "tag"])]), [
      { keyspace: "db", models: ["Blog/PostTag", "Blog/Tag"] }
    ]);
  }

  @test
  aHierarchySharesItsKeyspace() {
    // A subclass is stored next to its parent on purpose: one family, no collision
    assert.deepStrictEqual(
      findKeyCollisions([
        entry("Blog/Post", ["slug"]),
        entry("Blog/Article", ["slug"], "db", ["Blog/Post"]),
        entry("Blog/News", ["slug"], "db", ["Blog/Article", "Blog/Post"])
      ]),
      []
    );
  }

  @test
  separateKeyspacesAndGeneratedKeysAreSafe() {
    assert.deepStrictEqual(
      findKeyCollisions([
        entry("Blog/Post", ["slug"], "blog_post"),
        entry("Blog/Tag", ["slug"], "blog_tag"),
        // uuid keys are generated: they do not collide in practice
        entry("Blog/User", ["uuid"]),
        entry("Blog/Group", ["uuid"]),
        // Abstract models have no key and are never stored
        entry("Blog/Abstract", [])
      ]),
      []
    );
  }

  @test
  everyKeyspaceIsReported() {
    assert.deepStrictEqual(
      findKeyCollisions([
        entry("A/One", ["name"], "first"),
        entry("A/Two", ["name"], "first"),
        entry("A/Three", ["code"], "second"),
        entry("A/Four", ["code"], "second"),
        entry("A/Five", ["code"], "second", ["A/Four"])
      ]),
      [
        { keyspace: "first", models: ["A/One", "A/Two"] },
        { keyspace: "second", models: ["A/Four", "A/Three"] }
      ]
    );
  }
}
