import { suite, test } from "@webda/test";
import * as assert from "assert";
import { checkResourceKey, getCrdNames, isResourceName } from "./naming.js";

@suite
class NamingTest {
  @test
  resourceNames() {
    assert.ok(isResourceName("acme"));
    assert.ok(isResourceName("acme-1.eu"));
    assert.ok(isResourceName("0b1f7a52-1c0e-4c1b-9a35-2f0c1a9f1e8b"));
    assert.ok(!isResourceName("Acme"));
    assert.ok(!isResourceName("acme_1"));
    assert.ok(!isResourceName("-acme"));
    assert.ok(!isResourceName("acme."));
    assert.ok(!isResourceName(""));
    assert.ok(!isResourceName("a".repeat(254)));
  }

  @test
  names() {
    assert.deepStrictEqual(
      getCrdNames({ Identifier: "Webda/User", Plural: "Users", PrimaryKey: ["uuid"] }, "webda.io"),
      {
        name: "users.webda.io",
        kind: "User",
        listKind: "UserList",
        plural: "users",
        singular: "user"
      }
    );
    assert.deepStrictEqual(
      getCrdNames({ Identifier: "Tenant", Plural: "Tenants", ShortName: "TN", PrimaryKey: ["uuid"] }, "a.b").shortNames,
      ["tn"]
    );
    assert.strictEqual(
      getCrdNames({ Identifier: "WebdaTest/Ident", Plural: "WebdaTest/Idents", PrimaryKey: ["uuid"] }, "a.b").plural,
      "idents"
    );
  }

  @test
  keys() {
    checkResourceKey({ Identifier: "A", Plural: "As", PrimaryKey: ["uuid"] });
    checkResourceKey({ Identifier: "A", Plural: "As", PrimaryKey: ["a", "b"], PrimaryKeySeparator: "." });
    checkResourceKey({ Identifier: "A", Plural: "As", PrimaryKey: ["a", "b"], PrimaryKeySeparator: "-" });
    assert.throws(() => checkResourceKey({ Identifier: "A", Plural: "As", PrimaryKey: [] }), /no primary key/);
    assert.throws(() => checkResourceKey({ Identifier: "A", Plural: "As", PrimaryKey: ["a", "b"] }), /composite/);
  }
}
