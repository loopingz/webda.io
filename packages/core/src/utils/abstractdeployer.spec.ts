import { suite, test } from "@webda/test";
import * as assert from "assert";
import { AbstractDeployer } from "./abstractdeployer.js";

@suite
class CovAbstractDeployer {
  @test
  getSchema() {
    assert.strictEqual(AbstractDeployer.getSchema(), undefined);
  }
}
