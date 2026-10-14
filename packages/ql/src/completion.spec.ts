import { suite, test } from "@webda/test";
import * as assert from "assert";
import {
  getCompletions,
  fieldsFromSchema,
  type CompletionField,
  type CompletionOptions,
  type JSONSchema7Like
} from "./completion.js";

const TEST_FIELDS: CompletionField[] = [
  { name: "status", type: "string", enum: ["open", "closed"] },
  { name: "priority", type: "integer" },
  { name: "done", type: "boolean" },
  { name: "profile.email", type: "string" }
];

/**
 * Helper that takes a query string containing '|' as caret marker,
 * runs getCompletions, and returns the result.
 */
function complete(markedQuery: string, options: CompletionOptions = { fields: TEST_FIELDS }) {
  const caret = markedQuery.indexOf("|");
  if (caret === -1) {
    throw new Error(`Test query must contain '|' to mark caret: "${markedQuery}"`);
  }
  const cleanQuery = markedQuery.slice(0, caret) + markedQuery.slice(caret + 1);
  return getCompletions(cleanQuery, caret, options);
}

@suite
export class CompletionTest {
  @test
  caretAtStart() {
    // "|" -> fields, SELECT, DELETE, UPDATE, ORDER BY, LIMIT
    const res = complete("|");
    const labels = res.items.map(i => i.label);

    assert.ok(labels.includes("status"), "Should include status field");
    assert.ok(labels.includes("priority"), "Should include priority field");
    assert.ok(labels.includes("done"), "Should include done field");
    assert.ok(labels.includes("profile.email"), "Should include profile.email field");
    assert.ok(labels.includes("SELECT"), "Should include SELECT");
    assert.ok(labels.includes("DELETE"), "Should include DELETE");
    assert.ok(labels.includes("UPDATE"), "Should include UPDATE");
    assert.ok(labels.includes("ORDER BY"), "Should include ORDER BY");
    assert.ok(labels.includes("LIMIT"), "Should include LIMIT");

    // with filterOnly: no SELECT/DELETE/UPDATE
    const filterRes = complete("|", { fields: TEST_FIELDS, filterOnly: true });
    const filterLabels = filterRes.items.map(i => i.label);
    assert.ok(!filterLabels.includes("SELECT"), "filterOnly should exclude SELECT");
    assert.ok(!filterLabels.includes("DELETE"), "filterOnly should exclude DELETE");
    assert.ok(!filterLabels.includes("UPDATE"), "filterOnly should exclude UPDATE");
    assert.ok(filterLabels.includes("status"), "filterOnly should still include fields");
    assert.ok(filterLabels.includes("ORDER BY"), "filterOnly should still include ORDER BY");
    assert.ok(filterLabels.includes("LIMIT"), "filterOnly should still include LIMIT");
  }

  @test
  partialIdentifier() {
    // "sta|" -> status with range [0,3]
    const res = complete("sta|");
    assert.strictEqual(res.prefix, "sta");
    const statusItem = res.items.find(i => i.label === "status");
    assert.ok(statusItem, "Should offer status");
    assert.deepStrictEqual(statusItem!.range, [0, 3]);
    assert.strictEqual(statusItem!.kind, "field");
  }

  @test
  afterIdentifier() {
    // "status |" -> =, !=, IN, LIKE, CONTAINS, IS NULL, IS NOT NULL; no fields
    const res = complete("status |");
    const labels = res.items.map(i => i.label);

    assert.ok(labels.includes("="), "Should include =");
    assert.ok(labels.includes("!="), "Should include !=");
    assert.ok(labels.includes("IN"), "Should include IN");
    assert.ok(labels.includes("LIKE"), "Should include LIKE");
    assert.ok(labels.includes("CONTAINS"), "Should include CONTAINS");
    assert.ok(labels.includes("IS NULL"), "Should include IS NULL");
    assert.ok(labels.includes("IS NOT NULL"), "Should include IS NOT NULL");

    // no fields
    assert.ok(!labels.includes("status"), "Should not include status field");
    assert.ok(!labels.includes("priority"), "Should not include priority field");
    assert.ok(!labels.includes("done"), "Should not include done field");
  }

  @test
  afterComparisonOnEnumField() {
    // "status = |" -> 'open', 'closed', ?; no TRUE
    const res = complete("status = |");
    const labels = res.items.map(i => i.label);

    assert.ok(labels.includes("'open'"), "Should include 'open'");
    assert.ok(labels.includes("'closed'"), "Should include 'closed'");
    assert.ok(labels.includes("?"), "Should include ?");
    assert.ok(!labels.includes("TRUE"), "Should NOT include TRUE");
    assert.ok(!labels.includes("FALSE"), "Should NOT include FALSE");
  }

  @test
  afterComparisonOnBooleanField() {
    // "done = |" -> TRUE, FALSE
    const res = complete("done = |");
    const labels = res.items.map(i => i.label);

    assert.ok(labels.includes("TRUE"), "Should include TRUE");
    assert.ok(labels.includes("FALSE"), "Should include FALSE");
  }

  @test
  afterCompleteComparison() {
    // "status = 'open' |" -> AND, OR, ORDER BY, LIMIT, OFFSET
    const res = complete("status = 'open' |");
    const labels = res.items.map(i => i.label);

    assert.ok(labels.includes("AND"), "Should include AND");
    assert.ok(labels.includes("OR"), "Should include OR");
    assert.ok(labels.includes("ORDER BY"), "Should include ORDER BY");
    assert.ok(labels.includes("LIMIT"), "Should include LIMIT");
    assert.ok(labels.includes("OFFSET"), "Should include OFFSET");
  }

  @test
  afterCompleteComparisonWithPrefix() {
    // "status = 'open' ord|" -> ORDER BY
    const res = complete("status = 'open' ord|");
    const labels = res.items.map(i => i.label);

    assert.strictEqual(res.prefix, "ord");
    assert.ok(labels.includes("ORDER BY"), "Should include ORDER BY");
    assert.ok(!labels.includes("AND"), "Should not include AND");
  }

  @test
  afterOrderByField() {
    // "ORDER BY priority |" -> ASC, DESC, ,, LIMIT
    const res = complete("ORDER BY priority |");
    const labels = res.items.map(i => i.label);

    assert.ok(labels.includes("ASC"), "Should include ASC");
    assert.ok(labels.includes("DESC"), "Should include DESC");
    assert.ok(labels.includes(","), "Should include ,");
    assert.ok(labels.includes("LIMIT"), "Should include LIMIT");
  }

  @test
  afterSelect() {
    // "SELECT |" -> fields, COUNT, SUM, AVG, MIN, MAX
    const res = complete("SELECT |");
    const labels = res.items.map(i => i.label);

    assert.ok(labels.includes("status"), "Should include status");
    assert.ok(labels.includes("priority"), "Should include priority");
    assert.ok(labels.includes("COUNT"), "Should include COUNT");
    assert.ok(labels.includes("SUM"), "Should include SUM");
    assert.ok(labels.includes("AVG"), "Should include AVG");
    assert.ok(labels.includes("MIN"), "Should include MIN");
    assert.ok(labels.includes("MAX"), "Should include MAX");
  }

  @test
  afterSelectCountStar() {
    // "SELECT COUNT(*) |" -> AS
    const res = complete("SELECT COUNT(*) |");
    const labels = res.items.map(i => i.label);

    assert.ok(labels.includes("AS"), "Should include AS");
  }

  @test
  afterUpdate() {
    // "UPDATE |" -> SET only
    const res = complete("UPDATE |");
    const labels = res.items.map(i => i.label);

    assert.deepStrictEqual(labels, ["SET"]);
  }

  @test
  afterUpdateSet() {
    // "UPDATE SET |" -> fields
    const res = complete("UPDATE SET |");
    const labels = res.items.map(i => i.label);

    assert.ok(labels.includes("status"), "Should include status");
    assert.ok(labels.includes("priority"), "Should include priority");
    assert.ok(labels.includes("done"), "Should include done");
    assert.ok(labels.includes("profile.email"), "Should include profile.email");
  }

  @test
  dottedPathPrefix() {
    // "profile.|" -> profile.email only, range covers profile.
    const res = complete("profile.|");
    const labels = res.items.map(i => i.label);

    assert.deepStrictEqual(labels, ["profile.email"]);
    assert.strictEqual(res.prefix, "profile.");
    assert.deepStrictEqual(res.items[0].range, [0, 8]);
  }

  @test
  insideStringLiteral() {
    // "status = 'op|'" -> 'open' (inside a string)
    const res = complete("status = 'op|'");
    const labels = res.items.map(i => i.label);

    assert.deepStrictEqual(labels, ["'open'"]);
    assert.strictEqual(res.prefix, "op");
    assert.deepStrictEqual(res.items[0].range, [9, 13]);
  }

  @test
  insideUnclosedStringLiteral() {
    const res = complete("status = 'op|");
    const labels = res.items.map(i => i.label);

    assert.deepStrictEqual(labels, ["'open'"]);
    assert.strictEqual(res.prefix, "op");
  }

  @test
  afterLimit() {
    // "LIMIT |" -> ? (no fields)
    const res = complete("LIMIT |");
    const labels = res.items.map(i => i.label);

    assert.ok(labels.includes("?"), "Should include ?");
    assert.ok(!labels.includes("status"), "Should not include fields");
    assert.ok(!labels.includes("priority"), "Should not include fields");
  }

  @test
  syntaxErrorAndCaretBoundsNoThrow() {
    // "x = #|", caret -1, caret 999 -> no throw
    assert.doesNotThrow(() => complete("x = #|"));

    assert.doesNotThrow(() => {
      const res = getCompletions("status =", -1, { fields: TEST_FIELDS });
      assert.ok(Array.isArray(res.items));
    });

    assert.doesNotThrow(() => {
      const res = getCompletions("status =", 999, { fields: TEST_FIELDS });
      assert.ok(Array.isArray(res.items));
    });

    assert.doesNotThrow(() => {
      const res = getCompletions(null as any, 0);
      assert.deepStrictEqual(res, { items: [], prefix: "" });
    });
  }

  @test
  noFieldsOption() {
    // no fields option -> no field items, keywords still offered
    const res = complete("sta|", { fields: undefined });
    assert.strictEqual(res.items.filter(i => i.kind === "field").length, 0);

    const emptyRes = complete("|", { fields: undefined });
    const labels = emptyRes.items.map(i => i.label);
    assert.ok(labels.includes("SELECT"), "Keywords still offered when fields undefined");
    assert.ok(labels.includes("ORDER BY"), "Keywords still offered when fields undefined");
  }

  @test
  namedParameters() {
    const res = complete("status = |", {
      fields: TEST_FIELDS,
      parameters: ["myStatus", ":other"]
    });
    const labels = res.items.map(i => i.label);
    assert.ok(labels.includes(":myStatus"));
    assert.ok(labels.includes(":other"));
    assert.ok(labels.includes("?"));
  }

  @test
  candidateLimit() {
    const res = complete("|", { fields: TEST_FIELDS, limit: 3 });
    assert.strictEqual(res.items.length, 3);
  }

  @test
  fieldsFromSchema() {
    const schema: JSONSchema7Like = {
      type: "object",
      properties: {
        title: { type: "string", description: "Post title" },
        status: { type: "string", enum: ["draft", "published"], description: "Post status" },
        count: { type: "integer" },
        active: { type: "boolean" },
        author: {
          type: "object",
          description: "Author info",
          properties: {
            name: { type: "string" },
            contact: {
              type: "object",
              properties: {
                email: { type: "string" },
                deep: {
                  type: "object",
                  properties: {
                    level4: { type: "string" }
                  }
                }
              }
            }
          }
        },
        ignoredRef: {
          $ref: "#/definitions/SomeType"
        },
        booleanTrueProp: true,
        booleanFalseProp: false
      }
    };

    const fields = fieldsFromSchema(schema);
    const names = fields.map(f => f.name);

    assert.ok(names.includes("title"), "Should include title");
    assert.ok(names.includes("status"), "Should include status");
    assert.ok(names.includes("count"), "Should include count");
    assert.ok(names.includes("active"), "Should include active");
    assert.ok(names.includes("author.name"), "Should include author.name");
    assert.ok(names.includes("author.contact.email"), "Should include author.contact.email");
    assert.ok(names.includes("booleanTrueProp"), "Should include boolean true property");
    assert.ok(!names.includes("booleanFalseProp"), "Should exclude boolean false property");
    assert.ok(!names.includes("ignoredRef"), "Should skip $ref property");

    // Check depth limit (maxDepth = 3: author(1) -> contact(2) -> deep(3), level4 is at depth 4)
    assert.ok(names.includes("author.contact.deep"), "Deep object should be included as object at depth limit");
    assert.ok(!names.includes("author.contact.deep.level4"), "Should not recurse past maxDepth 3");

    // Check enum/type/description copied
    const statusField = fields.find(f => f.name === "status");
    assert.deepStrictEqual(statusField?.enum, ["draft", "published"]);
    assert.strictEqual(statusField?.type, "string");
    assert.strictEqual(statusField?.description, "Post status");

    // Empty or non-object schema
    assert.deepStrictEqual(fieldsFromSchema({} as any), []);
    assert.deepStrictEqual(fieldsFromSchema(null as any), []);
  }

  @test
  performanceCheck() {
    const query =
      "SELECT title, content, author, createdAt WHERE status = 'published' AND priority > 10 AND done = TRUE AND category IN ['tech', 'news'] ORDER BY createdAt DESC LIMIT 20 OFFSET 'token123'";
    assert.ok(query.length >= 180, "Query should be around 200 characters");

    const start = Date.now();
    for (let i = 0; i < 1000; i++) {
      getCompletions(query, 50, { fields: TEST_FIELDS });
    }
    const elapsed = Date.now() - start;
    console.log(`1,000 getCompletions calls completed in ${elapsed}ms`);
    if (elapsed > 1000) {
      console.warn(`Performance warning: 1000 calls took ${elapsed}ms (target <1000ms)`);
    }
    assert.ok(elapsed < 5000, `Expected 1000 calls to complete within reasonable time, took ${elapsed}ms`);
  }
}
