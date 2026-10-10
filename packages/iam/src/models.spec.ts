import { registerOperationAuthorizer, SimpleOperationContext, unregisterOperationAuthorizer } from "@webda/core";
import { suite, test } from "@webda/test";
import * as assert from "assert";
import { IAMTest } from "../test/fixture.js";
import { IAM_ALLOWED_OPERATION, IAM_AUTHORIZER, isIAMActive } from "./active.js";
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
    // A registered IAM authorizer whose policies are not loaded (not initialized, or stopped) keeps them closed
    let live = false;
    const authorizer = Object.assign(async () => true as const, { [IAM_AUTHORIZER]: () => live });
    registerOperationAuthorizer(authorizer);
    assert.strictEqual(isIAMActive(), false);
    assert.notStrictEqual(await IAMPolicy.canAct(undefined, "create"), true);
    live = true;
    try {
      assert.strictEqual(isIAMActive(), true);
      // IAM running is not enough: the context must carry the IAMService decision for its current operation
      assert.notStrictEqual(await IAMPolicy.canAct(undefined, "create"), true);
      assert.notStrictEqual(await IAMPolicyAttachment.canAct(undefined, "delete", new IAMPolicyAttachment()), true);
      const ctx = new SimpleOperationContext();
      assert.notStrictEqual(await IAMPolicy.canAct(ctx, "create"), true);
      ctx.setExtension("operation", "IAMPolicy.Create");
      assert.notStrictEqual(await IAMPolicy.canAct(ctx, "create"), true);
      ctx.setExtension(IAM_ALLOWED_OPERATION, "IAMPolicy.Get");
      assert.notStrictEqual(await IAMPolicy.canAct(ctx, "create"), true, "marker of another operation");
      ctx.setExtension(IAM_ALLOWED_OPERATION, "IAMPolicy.Create");
      assert.strictEqual(await IAMPolicy.canAct(ctx, "create"), true);
      ctx.setExtension("operation", "IAMPolicyAttachment.Delete");
      ctx.setExtension(IAM_ALLOWED_OPERATION, "IAMPolicyAttachment.Delete");
      assert.strictEqual(await IAMPolicyAttachment.canAct(ctx, "delete", new IAMPolicyAttachment()), true);
      live = false;
      assert.notStrictEqual(await IAMPolicyAttachment.canAct(ctx, "delete", new IAMPolicyAttachment()), true);
    } finally {
      unregisterOperationAuthorizer(authorizer);
    }
  }
}
