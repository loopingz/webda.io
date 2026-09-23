import { suite, test } from "@webda/test";
import * as assert from "assert";
import { existsSync, unlinkSync } from "fs";
import { assertUnreachable, getFileName, isMainModule, NotEnumerable, StaticInterface } from "./lib";

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
class TscEsmTest {
  testFiles: string[] = [];

  afterEach() {
    for (const f of this.testFiles) {
      if (existsSync(f)) {
        unlinkSync(f);
      }
    }
    this.testFiles.length = 0;
  }

  @test
  meta() {
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

  @test
  isMainModuleTest() {
    assert.ok(!isMainModule(import.meta));
  }

  @test
  getFileNameTest() {
    const fileName = getFileName(import.meta);
    assert.ok(fileName.match(/lib\.spec\.[tj]s$/));
    assert.throws(() => getFileName({} as any));
  }
}
