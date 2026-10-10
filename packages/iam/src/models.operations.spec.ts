import {
  callOperation,
  DomainService,
  SimpleOperationContext,
  useApplication,
  useCore,
  useInstanceStorage,
  WebdaError
} from "@webda/core";
import { suite, test } from "@webda/test";
import * as assert from "assert";
import { IAMTest } from "../test/fixture.js";
import { isIAMActive } from "./active.js";
import { IAMPolicy } from "./iampolicy.model.js";
import { IAMPolicyAttachment } from "./iampolicyattachment.model.js";

/**
 * The IAM models through the real operation path (DomainService operations) with NO IAMService registered:
 * every operation must be refused, otherwise anyone could plant an attachment granting itself IAMAdmin
 */
@suite
class IAMModelsOperationsTest extends IAMTest {
  /**
   * Call an operation as an anonymous caller
   * @param operationId - the operation id
   * @param body - the JSON body
   * @param parameters - the path parameters
   * @returns the context output
   */
  async call(operationId: string, body: any = {}, parameters: any = {}) {
    // Guard against a false pass: an unknown operation is a NotFound too
    assert.ok(useInstanceStorage().operations[operationId], `${operationId} is registered`);
    const ctx = new SimpleOperationContext();
    ctx.setInput(Buffer.from(JSON.stringify(body)));
    ctx.setParameters(parameters);
    await ctx.init();
    await callOperation(ctx, operationId);
    return ctx.getOutput();
  }

  /**
   * Framework models stay internal unless the application namespace resolves to them: emulate an application
   * exposing the IAM models (as a subclass in its own namespace would) and register the DomainService operations
   */
  async beforeEach() {
    await super.beforeEach();
    const app = useApplication<any>();
    const isFinalModel = app.isFinalModel.bind(app);
    this.stub(app, "isFinalModel").callsFake((model: string) => model.startsWith("Webda/IAM") || isFinalModel(model));
    useCore().getService<DomainService>("DomainService").initOperations();
  }

  async afterEach() {
    for (const attachment of (await IAMPolicyAttachment.query("")).results ?? []) {
      await attachment.delete();
    }
    for (const policy of (await IAMPolicy.query("")).results ?? []) {
      await policy.delete();
    }
    await super.afterEach();
  }

  @test
  async operationsAreRegistered() {
    const operations = Object.keys(useInstanceStorage().operations ?? {});
    for (const id of [
      "IAMPolicy.Create",
      "IAMPolicy.Get",
      "IAMPolicy.Update",
      "IAMPolicy.Patch",
      "IAMPolicy.Delete",
      "IAMPolicies.Query",
      "IAMPolicyAttachment.Create",
      "IAMPolicyAttachment.Delete",
      "IAMPolicyAttachments.Query"
    ]) {
      assert.ok(operations.includes(id), `${id} is registered`);
    }
  }

  @test
  async writesAreRefusedWithoutIAMService() {
    assert.strictEqual(isIAMActive(), false);
    await assert.rejects(
      () => this.call("IAMPolicyAttachment.Create", { principal: "anonymous", policy: "IAMAdmin" }),
      WebdaError.Forbidden
    );
    await assert.rejects(
      () =>
        this.call("IAMPolicy.Create", {
          name: "Open",
          statements: [{ effect: "allow", operations: ["*"] }]
        }),
      WebdaError.Forbidden
    );
    assert.strictEqual((await IAMPolicyAttachment.query("")).results.length, 0);
    assert.strictEqual((await IAMPolicy.query("")).results.length, 0);
  }

  @test
  async readsAndUpdatesAreRefusedWithoutIAMService() {
    await IAMPolicy.create({ name: "Stored", statements: [] } as any);
    const attachment = await IAMPolicyAttachment.create({ principal: "group:x", policy: "Stored" } as any);
    // A caller who may not read an object gets the error of a missing object
    await assert.rejects(() => this.call("IAMPolicy.Get", {}, { name: "Stored" }), WebdaError.NotFound);
    await assert.rejects(
      () => this.call("IAMPolicy.Patch", { description: "x" }, { name: "Stored" }),
      WebdaError.NotFound
    );
    await assert.rejects(
      () => this.call("IAMPolicy.Update", { name: "Stored", statements: [] }, { name: "Stored" }),
      WebdaError.NotFound
    );
    await assert.rejects(() => this.call("IAMPolicy.Delete", {}, { name: "Stored" }), WebdaError.NotFound);
    await assert.rejects(
      () => this.call("IAMPolicyAttachment.Delete", {}, { uuid: attachment.uuid }),
      WebdaError.NotFound
    );
    // Listings return no rows (or refuse)
    for (const id of ["IAMPolicies.Query", "IAMPolicyAttachments.Query"]) {
      try {
        const output: any = await this.call(id, { q: "" });
        const result = typeof output === "string" ? JSON.parse(output) : output;
        assert.strictEqual(result?.results?.length ?? 0, 0, id);
      } catch (err) {
        assert.ok(err instanceof WebdaError.Forbidden || err instanceof WebdaError.NotFound, `${id}: ${err}`);
      }
    }
    // Still stored, untouched
    assert.strictEqual((await IAMPolicy.ref("Stored").get()).description, undefined);
    assert.ok(await IAMPolicyAttachment.ref(attachment.uuid).get());
  }
}
