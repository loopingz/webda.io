import { registerOperationAuthorizer, unregisterOperationAuthorizer } from "@webda/core";
import { suite, test } from "@webda/test";
import * as assert from "assert";
import { IAMTest } from "../test/fixture.js";
import { IAM_AUTHORIZER, isIAMActive } from "./active.js";
import { IAMPolicy } from "./iampolicy.model.js";
import { IAMPolicyAttachment } from "./iampolicyattachment.model.js";

@suite
class IAMModelsTest extends IAMTest {
  @test
  async storesPoliciesByName() {
    await IAMPolicy.create({ name: "Readers", statements: [{ effect: "allow", operations: ["*.Get"] }] } as any);
    const policy = await IAMPolicy.ref("Readers").get();
    assert.deepStrictEqual(policy.statements, [{ effect: "allow", operations: ["*.Get"] }]);
    await assert.rejects(() => IAMPolicy.create({ name: "Readers", statements: [] } as any));
    const attachment = await IAMPolicyAttachment.create({ principal: "group:x", policy: "Readers" } as any);
    assert.ok(attachment.uuid);
  }

  @test
  async canActFollowsIAM() {
    assert.strictEqual(isIAMActive(), false);
    assert.notStrictEqual(await IAMPolicy.canAct(undefined, "create"), true);
    assert.notStrictEqual(await IAMPolicyAttachment.canAct(undefined, "get", new IAMPolicyAttachment()), true);
    const authorizer = Object.assign(async () => true as const, { [IAM_AUTHORIZER]: true });
    registerOperationAuthorizer(authorizer);
    try {
      assert.strictEqual(isIAMActive(), true);
      assert.strictEqual(await IAMPolicy.canAct(undefined, "create"), true);
      assert.strictEqual(await IAMPolicyAttachment.canAct(undefined, "delete", new IAMPolicyAttachment()), true);
    } finally {
      unregisterOperationAuthorizer(authorizer);
    }
  }
}
