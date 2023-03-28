import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import { Deployment } from "./deployment";

@suite
class DeploymentTest {
  @test
  async canAct() {
    let deployment = new Deployment();
    assert.strictEqual(await deployment.canAct(undefined, undefined), true);
  }
}
