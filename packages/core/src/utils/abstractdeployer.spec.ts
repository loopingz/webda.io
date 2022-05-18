import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import { AbstractDeployer } from "./abstractdeployer";

@suite
class CovAbstractDeployer {
  @test
  getSchema() {
    assert.strictEqual(AbstractDeployer.getSchema(), undefined);
  }
}
