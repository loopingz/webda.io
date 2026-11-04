import { suite, test } from "@webda/test";
import * as assert from "assert";
import { assertUnreachable, NotEnumerable, StaticInterface } from "./types.js";

interface TestStatic {
  count: number;
}

@StaticInterface<TestStatic>()
class TestClass {
  @NotEnumerable
  notEnumerable = "test";
  static count: number = 0;
}

@suite
class TypesTest {
  @test
  notEnumerable() {
    const t = new TestClass();
    assert.ok(!Object.keys(t).includes("notEnumerable"));
  }

  @test
  assertUnreachableTest() {
    function f(x: "a" | "b") {
      switch (x) {
        case "a":
          return 1;
        case "b":
          return 2;
        default:
          return assertUnreachable(x);
      }
    }
    f("a");
    f("b");
    assert.throws(() => f("c" as any));
  }
}
