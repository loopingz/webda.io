import { suite, test } from "@webda/test";
import { getCommonJS } from "./index";
import * as assert from "assert";

@suite
class EsmTest {
  @test
  normal() {
    // This is a test
    const info = getCommonJS(import.meta.url);
    assert.ok(info.__dirname.endsWith("packages/utils/src"));
    assert.ok(info.__filename.endsWith("packages/utils/src/esm.spec.ts"));
  }
}
