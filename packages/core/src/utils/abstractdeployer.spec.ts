import { suite, test } from "../test/core";
import * as assert from "assert";
import { AbstractDeployer } from "./abstractdeployer";

@suite
class CovAbstractDeployer {
  @test
  getSchema() {
    assert.strictEqual(AbstractDeployer.getSchema(), undefined);
  }
}
