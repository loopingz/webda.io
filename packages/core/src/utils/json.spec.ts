import * as assert from "assert";
import { suite, test } from "@testdeck/mocha";
import { JSONUtils } from "./json";

@suite
class UtilsTest {
  @test("CircularJSON")
  ciruclarJSON() {
    let a: any = {
      b: "test",
      c: {}
    };
    a.c.a = a;
    assert.deepEqual(JSONUtils.stringify(a), JSON.stringify({ b: "test", c: {} }, undefined, 2));
    assert.deepEqual(
      JSONUtils.stringify(
        a,
        (key, value) => {
          if (key !== "b") return value;
          return undefined;
        },
        3
      ),
      JSON.stringify({ c: {} }, undefined, 3)
    );
  }
}
