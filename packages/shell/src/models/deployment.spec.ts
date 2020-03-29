import * as assert from "assert";
import { suite, test } from "mocha-typescript";
import { Deployment } from "./deployment";

@suite
class DeploymentTest {
  @test
  async canAct() {
    let deployment = new Deployment();
    assert.equal(await deployment.canAct(undefined, undefined), deployment);
  }
}
