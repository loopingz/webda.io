import { suite, test } from "@webda/test";
import { ServiceParameters } from "./serviceparameters.js";
import * as assert from "assert";

class TestParameters extends ServiceParameters {
  permissions: string[] = [];
  random: boolean = false;
  value: number = 0;
}

@suite
class ServiceParametersTest {
  @test
  serviceParameters() {
    let patch = 0;
    const perms = new TestParameters().load({
      permissions: ["RANDOM", "PRODUCT_1"],
      random: true,
      value: 123
    });
    perms.with((params: any) => {
      params.permissions.sort();
      patch++;
    });
    assert.strictEqual(patch, 1);
    perms.update(
      {
        permissions: ["RANDOM", "PRODUCT_1"],
        random: true,
        value: 124
      },
      { random: [], value: [] }
    );
    assert.strictEqual(patch, 1);
    assert.strictEqual(perms.random, true);
    perms.update(
      {
        permissions: ["RANDOM2", "PRODUCT_2"],
        random: true,
        value: 124
      },
      { permissions: [] }
    );
    assert.deepStrictEqual(perms.permissions, ["PRODUCT_2", "RANDOM2"]);
    assert.strictEqual(patch, 2);
  }
}
