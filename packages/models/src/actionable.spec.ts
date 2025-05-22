import * as assert from "node:assert";
import { ActionWrapper } from "./actionable";
import { UuidModel } from "./model";
import { suite, test } from "@webda/test";

class ActionableModel extends UuidModel {
  action = ActionWrapper((param: boolean) => {
    return "toto";
  }, "Description of the action");
}

class ActionableSubModel extends ActionableModel {
  action = ActionWrapper((param: boolean) => {
    if (param) {
      return "titi";
    }
    return ActionWrapper.super(this, "action", param);
  }, "Description of the action");
}

@suite
class ActionableTest {
  constructor(public name: string) {}

  @test
  doSomething() {
    const model = new ActionableModel();
    assert.strictEqual(model.action(true), "toto");
    assert.strictEqual(model.action(false), "toto");
    assert.strictEqual(model.action.description, "Description of the action");
    assert.strictEqual(model.action.action, true);
    const model2 = new ActionableSubModel();
    assert.strictEqual(model2.action(true), "titi");
    assert.strictEqual(model2.action(false), "toto");
    assert.strictEqual(model2.action.description, "Description of the action");
    assert.strictEqual(model2.action.action, true);
  }
}
