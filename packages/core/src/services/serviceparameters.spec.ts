import { suite, test } from "@webda/test";
import { Parameters } from "../application/parameters.js";
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
  sharedParameterWatchersTrackDynamicDependencies() {
    const empty = new Parameters().load();
    let untracked = 0;
    empty.with(() => {
      untracked++;
    });
    empty.update({}, {});
    assert.strictEqual(untracked, 1);
    assert.ok(!JSON.stringify(empty).includes("watchers"));
    const params = new TestParameters();
    let calls = 0;
    params.with(current => {
      calls++;
      if (current.random && current.random) void current.value;
      else void current.permissions;
    });
    params.update({ random: true }, { random: true });
    params.update({ value: 2 }, { value: true });
    assert.strictEqual(calls, 3);
    let read = true;
    params.with(current => {
      if (read) void current.value;
    });
    read = false;
    params.update({ value: 3 }, { value: true });
  }

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
