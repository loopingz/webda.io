import { suite, test } from "@webda/test";
import * as assert from "assert";
import * as WebdaQL from "./index.js";
import { getCompletions, relationsFromGraph, WebdaQLError, type CompletionOptions } from "./index.js";

const RELATIONS = [
  { name: "owner", model: "App/User" },
  { name: "project", model: "App/Project" },
  { name: "project.team", model: "App/Team" }
];

/**
 * Complete a query at its `|` marker
 * @param markedQuery - the query, with `|` at the caret
 * @param options - completion options
 * @returns the candidate labels
 */
function labels(markedQuery: string, options: CompletionOptions): string[] {
  const caret = markedQuery.indexOf("|");
  return getCompletions(markedQuery.replace("|", ""), caret, options).items.map(item => item.label);
}

@suite
export class HydrateTest {
  @test
  grammar() {
    // After a filter, alone, and with the paging clauses
    assert.deepStrictEqual(WebdaQL.parse("a = 1 HYDRATE owner").hydrate, [{ path: "owner", mode: "LEFT" }]);
    assert.deepStrictEqual(WebdaQL.parse("HYDRATE owner").hydrate, [{ path: "owner", mode: "LEFT" }]);
    const full = WebdaQL.parse(
      "a = 1 AND b = 2 HYDRATE owner, project INNER, project.team LEFT ORDER BY a DESC LIMIT 5 OFFSET 'tok'"
    );
    assert.deepStrictEqual(full.hydrate, [
      { path: "owner", mode: "LEFT" },
      { path: "project", mode: "INNER" },
      { path: "project.team", mode: "LEFT" }
    ]);
    assert.strictEqual(full.type, "SELECT");
    assert.strictEqual(full.fields, undefined);
    assert.strictEqual(full.limit, 5);
    assert.strictEqual(full.continuationToken, "tok");
    assert.deepStrictEqual(full.orderBy, [{ field: "a", direction: "DESC" }]);
    assert.strictEqual(full.filter.toString(), "a = 1 AND b = 2");
    // The filter still evaluates
    assert.strictEqual(new WebdaQL.QueryValidator("a = 1 HYDRATE owner").eval({ a: 1 }), true);
    // After SELECT ... WHERE, and after a field list without WHERE
    const select = WebdaQL.parse("SELECT title, owner.name WHERE a = 1 HYDRATE owner INNER LIMIT 2");
    assert.deepStrictEqual(select.fields, ["title", "owner.name"]);
    assert.deepStrictEqual(select.hydrate, [{ path: "owner", mode: "INNER" }]);
    assert.deepStrictEqual(WebdaQL.parse("SELECT title HYDRATE owner").hydrate, [{ path: "owner", mode: "LEFT" }]);
    // No clause: the query is unchanged
    assert.strictEqual(WebdaQL.parse("a = 1").hydrate, undefined);
    assert.ok(!("hydrate" in WebdaQL.parse("a = 1 ORDER BY a")));
    WebdaQL.validateSyntax("a = ? HYDRATE owner INNER LIMIT ?");
  }

  @test
  roundTrip() {
    for (const [query, printed] of [
      ["a = 1 HYDRATE owner", "a = 1 HYDRATE owner"],
      ["HYDRATE owner LEFT, project INNER", "HYDRATE owner, project INNER"],
      [
        "a = 'x' HYDRATE project INNER, project.team ORDER BY a ASC LIMIT 3 OFFSET 't'",
        'a = "x" HYDRATE project INNER, project.team ORDER BY a ASC LIMIT 3 OFFSET "t"'
      ],
      ["SELECT a, o.n WHERE b = 2 HYDRATE o LIMIT 1", "SELECT a, o.n WHERE b = 2 HYDRATE o LIMIT 1"],
      ["SELECT a HYDRATE o INNER", "SELECT a HYDRATE o INNER"]
    ]) {
      const parsed = WebdaQL.parse(query);
      assert.strictEqual(parsed.toString(), printed, query);
      assert.strictEqual(new WebdaQL.QueryValidator(query).toString(), printed, query);
      // The printed form parses back to the same query
      assert.deepStrictEqual(WebdaQL.parse(printed).hydrate, parsed.hydrate, query);
      assert.strictEqual(WebdaQL.parse(printed).toString(), printed, query);
      // normalizeQuery re-parses it
      const normalized = WebdaQL.normalizeQuery(parsed);
      assert.deepStrictEqual(normalized.hydrate, parsed.hydrate, query);
      assert.strictEqual(normalized.toString(), printed, query);
    }
    assert.strictEqual(
      WebdaQL.stringifyHydrate([
        { path: "a.b", mode: "INNER" },
        { path: "c", mode: "LEFT" }
      ]),
      "a.b INNER, c"
    );
    // A mode left out of a hand-built query is LEFT
    assert.deepStrictEqual(WebdaQL.normalizeQuery({ hydrate: [{ path: "o" } as any] }).hydrate, [
      { path: "o", mode: "LEFT" }
    ]);
  }

  @test
  normalizeRefusesInvalidClauses() {
    const filter = new WebdaQL.AndExpression([]);
    for (const hydrate of [
      [],
      "owner",
      [{ path: "o;DROP", mode: "LEFT" }],
      [{ path: "", mode: "LEFT" }],
      [{ path: "o", mode: "RIGHT" }],
      [undefined]
    ]) {
      assert.throws(
        () => WebdaQL.normalizeQuery({ filter, hydrate: hydrate as any }),
        WebdaQLError,
        JSON.stringify(hydrate)
      );
    }
    for (const type of ["DELETE", "UPDATE"] as const) {
      assert.throws(
        () =>
          WebdaQL.normalizeQuery({
            type,
            filter,
            assignments: [{ field: "a", value: 1 }],
            hydrate: [{ path: "o", mode: "LEFT" }]
          }),
        /Invalid HYDRATE/
      );
    }
  }

  @test
  refusedWhereNoObjectIsReturned() {
    for (const query of [
      // Aggregations
      "SELECT team, COUNT(*) AS n GROUP BY team HYDRATE team",
      "SELECT COUNT(*) AS n HYDRATE team",
      "SELECT SUM(points) AS total WHERE a = 1 HYDRATE team",
      "SELECT team GROUP BY team HYDRATE team",
      // Statements
      "DELETE HYDRATE owner",
      "DELETE WHERE a = 1 HYDRATE owner",
      "UPDATE SET a = 1 HYDRATE owner",
      "UPDATE SET a = 1 WHERE b = 2 HYDRATE owner",
      // Misplaced or incomplete clauses
      "a = 1 ORDER BY a HYDRATE owner",
      "a = 1 LIMIT 2 HYDRATE owner",
      "HYDRATE owner WHERE a = 1",
      "HYDRATE",
      "HYDRATE owner,",
      "HYDRATE owner RIGHT",
      "HYDRATE owner INNER LEFT",
      "HYDRATE owner project",
      "HYDRATE 'owner'",
      "HYDRATE owner HYDRATE project"
    ]) {
      assert.throws(() => WebdaQL.parse(query), SyntaxError, query);
    }
    assert.throws(
      () => WebdaQL.parse("SELECT team, COUNT(*) AS n GROUP BY team HYDRATE team"),
      /HYDRATE is not supported with GROUP BY or aggregate functions/
    );
  }

  @test
  keywordsAreUppercaseOnly() {
    // Lowercase forms stay field names
    const query = WebdaQL.parse("hydrate = 1 AND inner = 2 AND left = 3 ORDER BY hydrate ASC");
    assert.strictEqual(query.hydrate, undefined);
    assert.strictEqual(query.filter.eval({ hydrate: 1, inner: 2, left: 3 }), true);
    assert.deepStrictEqual(WebdaQL.parse("SELECT hydrate, inner, left").fields, ["hydrate", "inner", "left"]);
    assert.deepStrictEqual(WebdaQL.parse("HYDRATE hydrate, inner INNER, left LEFT").hydrate, [
      { path: "hydrate", mode: "LEFT" },
      { path: "inner", mode: "INNER" },
      { path: "left", mode: "LEFT" }
    ]);
    // The uppercase forms are keywords: no longer field names
    for (const keyword of ["HYDRATE", "INNER", "LEFT"]) {
      assert.throws(() => WebdaQL.parse(`${keyword} = 1`), SyntaxError, keyword);
      assert.throws(() => WebdaQL.parse(`SELECT ${keyword}`), SyntaxError, keyword);
    }
  }

  @test
  repositoriesRefuseHydrate() {
    for (const query of ["HYDRATE owner", "a = 1 HYDRATE owner INNER LIMIT 2"]) {
      assert.throws(
        () => WebdaQL.assertFilterQuery(WebdaQL.parse(query)),
        (err: any) => err instanceof WebdaQLError && /HYDRATE is not accepted here/.test(err.message),
        query
      );
    }
    assert.throws(() => WebdaQL.assertFilterQuery({ hydrate: [] }), /HYDRATE is not accepted here/);
    WebdaQL.assertFilterQuery(WebdaQL.parse("hydrate = 1"));
  }

  @test
  mergeAndBind() {
    // A permission filter merges into a query with HYDRATE, which keeps its clause
    assert.strictEqual(
      new WebdaQL.QueryValidator("a = 1 OR b = 2 HYDRATE owner INNER LIMIT 3").merge("c = 3").toString(),
      "( a = 1 OR b = 2 ) AND c = 3 HYDRATE owner INNER LIMIT 3"
    );
    assert.strictEqual(WebdaQL.PrependCondition("HYDRATE owner", "c = 3"), "c = 3 HYDRATE owner");
    // Only a filter can be merged in
    assert.throws(() => new WebdaQL.QueryValidator("a = 1").merge("HYDRATE owner"), /Only a filter can be merged/);
    assert.strictEqual(
      WebdaQL.bind("a = ? HYDRATE owner INNER LIMIT ?", ["x", 2]),
      "a = 'x' HYDRATE owner INNER LIMIT 2"
    );
  }

  @test
  completionKeywords() {
    const options: CompletionOptions = { fields: [{ name: "status" }], relations: RELATIONS };
    // Offered after a filter, after a WHERE condition, after a field list and at the start
    for (const query of ["status = 1 |", "SELECT status WHERE status = 1 |", "SELECT status |", "|"]) {
      assert.ok(labels(query, options).includes("HYDRATE"), query);
    }
    // Not once the paging clauses started, nor in a statement
    for (const query of ["status = 1 ORDER BY status |", "status = 1 LIMIT 2 |", "DELETE WHERE status = 1 |"]) {
      assert.ok(!labels(query, options).includes("HYDRATE"), query);
    }
    // After a path: the join modes, another relation or the next clauses
    const after = labels("HYDRATE owner |", options);
    for (const label of ["INNER", "LEFT", ",", "ORDER BY", "LIMIT"]) {
      assert.ok(after.includes(label), `Should include ${label}`);
    }
    assert.ok(!after.includes("owner") && !after.includes("status"));
    assert.deepStrictEqual(labels("HYDRATE owner INN|", options), ["INNER"]);
    const afterMode = labels("HYDRATE owner INNER |", options);
    assert.ok(afterMode.includes(",") && afterMode.includes("LIMIT"));
    assert.ok(!afterMode.includes("INNER") && !afterMode.includes("LEFT"));
    // The Query operations: offered with fieldList, not with filterOnly alone (GraphQL)
    const queryInput = { ...options, filterOnly: true, fieldList: true };
    assert.ok(labels("status = 1 |", queryInput).includes("HYDRATE"));
    assert.ok(labels("HYDRATE owner |", queryInput).includes("INNER"));
    const filterOnly = { ...options, filterOnly: true };
    assert.ok(!labels("status = 1 |", filterOnly).includes("HYDRATE"));
    for (const label of labels("HYDRATE owner |", filterOnly)) {
      assert.ok(!["INNER", "LEFT"].includes(label));
    }
  }

  @test
  completionRelations() {
    const options: CompletionOptions = { fields: [{ name: "status" }, { name: "title" }], relations: RELATIONS };
    // Relations instead of fields, at every position of the clause
    for (const query of ["HYDRATE |", "status = 1 HYDRATE |", "HYDRATE owner, |", "HYDRATE owner INNER, |"]) {
      assert.deepStrictEqual(labels(query, options), ["owner", "project", "project.team"], query);
    }
    const res = getCompletions("HYDRATE ", 8, options);
    assert.deepStrictEqual(res.items[0], {
      label: "owner",
      insertText: "owner",
      kind: "field",
      detail: "App/User",
      range: [8, 8]
    });
    // Per level: the prefix filters, and a `.` reaches the relations of the target
    assert.deepStrictEqual(labels("HYDRATE pro|", options), ["project", "project.team"]);
    assert.deepStrictEqual(labels("HYDRATE owner, project.|", options), ["project.team"]);
    assert.deepStrictEqual(labels("HYDRATE owner.|", options), []);
    // Without relations: no candidate, never the fields
    assert.deepStrictEqual(labels("HYDRATE |", { fields: options.fields }), []);
    // Fields are still offered outside of the clause
    assert.ok(labels("HYDRATE owner ORDER BY |", options).includes("status"));
    assert.ok(labels("SELECT | HYDRATE owner", options).includes("title"));
    assert.ok(!labels("SELECT | HYDRATE owner", options).includes("owner"));
  }

  @test
  relationsFromModelGraph() {
    const graphs: Record<string, any> = {
      "App/Task": {
        parent: { attribute: "project", model: "App/Project" },
        links: [
          { attribute: "owner", model: "App/User", type: "LINK" },
          { attribute: "tags", model: "App/Tag", type: "LINKS_SIMPLE_ARRAY" },
          { attribute: "", model: "App/Tag", type: "LINK" }
        ],
        // Not hydratable: never listed
        queries: [{ attribute: "comments", model: "App/Comment", targetAttribute: "task" }],
        maps: [{ attribute: "names", model: "App/User", targetAttributes: ["name"], targetLink: "x" }],
        polymorphicLinks: [{ attribute: "subject" }]
      },
      "App/Project": { links: [{ attribute: "team", model: "App/Team", type: "LINK" }] },
      "App/Team": { parent: { attribute: "company", model: "App/Company" } },
      "App/User": {}
    };
    const resolve = (model: string) => graphs[model];
    assert.deepStrictEqual(relationsFromGraph(graphs["App/Task"]), [
      { name: "project", model: "App/Project" },
      { name: "owner", model: "App/User" },
      { name: "tags", model: "App/Tag" }
    ]);
    assert.deepStrictEqual(
      relationsFromGraph(graphs["App/Task"], resolve).map(r => r.name),
      ["project", "project.team", "owner", "tags"]
    );
    assert.deepStrictEqual(
      relationsFromGraph(graphs["App/Task"], resolve, 3).map(r => r.name),
      ["project", "project.team", "project.team.company", "owner", "tags"]
    );
    assert.deepStrictEqual(relationsFromGraph(graphs["App/Task"], resolve, 1).length, 3);
    assert.deepStrictEqual(relationsFromGraph(undefined), []);
    assert.deepStrictEqual(relationsFromGraph({}), []);
  }
}
