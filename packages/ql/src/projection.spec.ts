import { suite, test } from "@webda/test";
import * as assert from "assert";
import { projectFields } from "./index.js";

@suite
class ProjectionTest {
  @test
  topLevelFields() {
    const object = { uuid: "t1", title: "Title", status: "open", points: 3 };
    assert.deepStrictEqual(projectFields(object, ["uuid", "title"]), { uuid: "t1", title: "Title" });
    // Duplicates are ignored, the object is not changed
    assert.deepStrictEqual(projectFields(object, ["title", "title"]), { title: "Title" });
    assert.deepStrictEqual(object, { uuid: "t1", title: "Title", status: "open", points: 3 });
    assert.deepStrictEqual(projectFields(object, []), {});
  }

  @test
  keyOrderFollowsTheObject() {
    const projected = projectFields({ a: 1, b: 2, c: 3 }, ["c", "a"]);
    assert.deepStrictEqual(Object.keys(projected), ["a", "c"]);
  }

  @test
  dottedPaths() {
    const object = { uuid: "t1", b: { c: 1, d: 2, e: { f: 3, g: 4 } } };
    assert.deepStrictEqual(projectFields(object, ["b.c"]), { b: { c: 1 } });
    // Siblings merge
    assert.deepStrictEqual(projectFields(object, ["b.c", "b.d"]), { b: { c: 1, d: 2 } });
    assert.deepStrictEqual(projectFields(object, ["b.e.f", "uuid"]), { uuid: "t1", b: { e: { f: 3 } } });
    // A path and one of its parents: the whole parent, in any order
    assert.deepStrictEqual(projectFields(object, ["b", "b.c"]), { b: object.b });
    assert.deepStrictEqual(projectFields(object, ["b.c", "b"]), { b: object.b });
    assert.deepStrictEqual(projectFields(object, ["b.e.f", "b.e"]), { b: { e: { f: 3, g: 4 } } });
  }

  @test
  arrays() {
    const object = {
      tags: [
        { name: "a", color: "red" },
        { name: "b", color: "blue", meta: { x: 1, y: 2 } }
      ],
      list: [1, 2]
    };
    assert.deepStrictEqual(projectFields(object, ["tags.name"]), { tags: [{ name: "a" }, { name: "b" }] });
    assert.deepStrictEqual(projectFields(object, ["tags.meta.x"]), { tags: [{}, { meta: { x: 1 } }] });
    assert.deepStrictEqual(projectFields(object, ["list"]), { list: [1, 2] });
    // Scalars inside the array have no field: dropped
    assert.deepStrictEqual(projectFields({ tags: ["x", { name: "a" }, null] }, ["tags.name"]), {
      tags: [{ name: "a" }]
    });
    // Nested arrays, and an array of objects
    assert.deepStrictEqual(projectFields({ grid: [[{ a: 1, b: 2 }]] }, ["grid.a"]), { grid: [[{ a: 1 }]] });
    assert.deepStrictEqual(projectFields([{ a: 1, b: 2 }], ["a"]), [{ a: 1 }]);
  }

  @test
  scalarsAndNullOnThePath() {
    const date = new Date();
    const object = { a: 5, b: null, c: "text", d: date, e: Buffer.from("x"), f: { g: null } };
    // The path goes through a scalar or null: omitted
    assert.deepStrictEqual(projectFields(object, ["a.x", "b.x", "c.x", "d.x", "e.x"]), {});
    // Selected itself, or through a selected parent: kept as is
    assert.deepStrictEqual(projectFields(object, ["a", "b", "d", "a.x"]), { a: 5, b: null, d: date });
    // An existing null is kept, a missing value is not invented
    assert.deepStrictEqual(projectFields(object, ["f.g", "f.missing", "missing", "missing.x"]), { f: { g: null } });
    assert.deepStrictEqual(projectFields({ a: undefined, b: 1 }, ["a", "b"]), { b: 1 });
    // An object on the path is kept even when none of its fields is selected
    assert.deepStrictEqual(projectFields(object, ["f.missing"]), { f: {} });
  }

  @test
  notAnObject() {
    assert.strictEqual(projectFields(null, ["a"]), null);
    assert.strictEqual(projectFields(undefined, ["a"]), undefined);
    assert.strictEqual(projectFields("text" as any, ["a"]), "text");
  }

  @test
  prototypeMembersAreNeverAssigned() {
    const object = JSON.parse('{"__proto__": {"polluted": true}, "constructor": {"prototype": {"x": 1}}, "a": 1}');
    const projected: any = projectFields(object, [
      "__proto__",
      "__proto__.polluted",
      "constructor",
      "constructor.prototype",
      "prototype",
      "a.__proto__",
      "a"
    ]);
    assert.deepStrictEqual(Object.keys(projected), ["a"]);
    assert.strictEqual(Object.getPrototypeOf(projected), Object.prototype);
    assert.strictEqual(projected.polluted, undefined);
    assert.strictEqual(({} as any).polluted, undefined);
    // Inherited fields are not read
    assert.deepStrictEqual(projectFields(Object.create({ inherited: 1 }), ["inherited", "toString"]), {});
    // Empty segments select nothing
    assert.deepStrictEqual(projectFields({ a: { "": 1 }, "": 2 }, ["", "a.", ".a"]), {});
  }
}
