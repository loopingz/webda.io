import { suite, test } from "@webda/test";
import { ServiceParameters } from "./serviceparameters";
import * as assert from "assert";

@suite
class ServiceParametersTest {
  @test
  serviceParameters() {
    let patch = 0;
    const perms: any = new ServiceParameters().load({
      permissions: ["RANDOM", "PRODUCT_1"],
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
