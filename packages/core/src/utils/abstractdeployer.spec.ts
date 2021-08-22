import { suite, test } from "@testdeck/mocha";
import { AbstractDeployer } from "./abstractdeployer";
import * as assert from "assert";

@suite
class CovAbstractDeployer {
  @test
  getSchema() {
    assert.strictEqual(AbstractDeployer.getSchema(), undefined);
  }
}
