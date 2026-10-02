import { suite, test } from "@webda/test";
import * as assert from "assert";
import { WebdaApplicationTest } from "../test/index.js";
import { TestApplication } from "../test/objects.js";
import { OperationContext } from "../contexts/operationcontext.js";
import { Service } from "../services/service.js";
import { ServiceParameters } from "../services/serviceparameters.js";
import { useModel } from "../application/hooks.js";
import { useCoreEvents } from "../events/events.js";
import {
  callOperation,
  parseSubjectKey,
  registerOperation,
  resolveOperationSubject,
  serializeSubjectKey,
  type OperationSubject
} from "./operations.js";

/**
 * Operation context with no request body
 */
class EmptyOpContext extends OperationContext {
  async getRawInput(): Promise<Buffer> {
    return Buffer.from("");
  }
}

/**
 * Target service: `create` returns a User instance like DomainService.modelCreate
 */
class SubjectTargetService extends Service {
  static createConfiguration(params: any): ServiceParameters {
    return new ServiceParameters().load(params);
  }

  static filterParameters(params: any) {
    return params;
  }

  async create(): Promise<any> {
    const User: any = useModel("Webda/User");
    const user = new User();
    user.uuid = "created-user";
    return user;
  }

  async fail(): Promise<void> {
    throw new Error("boom");
  }
}

@suite
class OperationSubjectTest extends WebdaApplicationTest {
  getTestConfiguration() {
    return { services: { SubjectTarget: { type: "SubjectTarget" } } };
  }

  async tweakApp(app: TestApplication): Promise<void> {
    app.addModda("Webda/SubjectTarget", SubjectTargetService);
  }

  operation(definition: any): any {
    return { id: "Test.Op", input: "void", output: "void", ...definition };
  }

  @test
  serializeKeys() {
    assert.strictEqual(serializeSubjectKey(["uuid"], "u1"), "u1");
    assert.strictEqual(serializeSubjectKey(["uuid"], { uuid: "u1" }), "u1");
    assert.strictEqual(serializeSubjectKey(["a", "b"], { a: "x", b: 1 }), '["x","1"]');
    assert.strictEqual(serializeSubjectKey(["a", "b"], { a: "x" }), undefined);
    assert.strictEqual(serializeSubjectKey(["uuid"], undefined), undefined);
  }

  @test
  parseKeys() {
    assert.strictEqual(parseSubjectKey(["uuid"], "u1"), "u1");
    assert.strictEqual(parseSubjectKey(["uuid"], { uuid: "u1" }), "u1");
    assert.strictEqual(parseSubjectKey(["uuid"], ""), undefined);
    assert.deepStrictEqual(parseSubjectKey(["a", "b"], '["x","y"]'), { a: "x", b: "y" });
    assert.deepStrictEqual(parseSubjectKey(["a", "b"], { a: "x", b: 2 }), { a: "x", b: "2" });
    assert.strictEqual(parseSubjectKey(["a", "b"], "not-json"), undefined);
    assert.strictEqual(parseSubjectKey(["a", "b"], '["only-one"]'), undefined);
    // Round trip: the canonical string parses back to the same key
    const key = parseSubjectKey(["a", "b"], { a: "x", b: "y" });
    assert.deepStrictEqual(parseSubjectKey(["a", "b"], serializeSubjectKey(["a", "b"], key)), key);
  }

  @test
  async subjectFromResolvedInput() {
    const User: any = useModel("Webda/User");
    const ctx = new EmptyOpContext();
    ctx.setExtension("operationResolvedInput", { uuid: "u1" });
    const subject = resolveOperationSubject(
      ctx,
      this.operation({ service: "SubjectTarget", method: "create", context: { model: User, pkFields: ["uuid"] } }),
      []
    );
    assert.deepStrictEqual(subject, { model: "Webda/User", key: "u1" });
  }

  @test
  async subjectFromParameters() {
    const User: any = useModel("Webda/User");
    const ctx = new EmptyOpContext();
    ctx.setParameters({ uuid: "u2" });
    const subject = resolveOperationSubject(
      ctx,
      this.operation({ service: "SubjectTarget", method: "create", context: { model: User, pkFields: ["uuid"] } }),
      []
    );
    assert.deepStrictEqual(subject, { model: "Webda/User", key: "u2" });
  }

  @test
  async subjectFromCreateResult() {
    const User: any = useModel("Webda/User");
    const op = this.operation({
      service: "SubjectTarget",
      method: "create",
      context: { model: User, pkFields: ["uuid"] }
    });
    const result = { getPrimaryKey: () => "new-id" };
    assert.deepStrictEqual(resolveOperationSubject(new EmptyOpContext(), op, [], result), {
      model: "Webda/User",
      key: "new-id"
    });
    // A failed Create has neither a key in its input nor a result
    assert.strictEqual(resolveOperationSubject(new EmptyOpContext(), op, []), undefined);
  }

  @test
  async subjectOfModelOperations() {
    const ctx = new EmptyOpContext();
    // Instance operation: key is the first argument
    assert.deepStrictEqual(
      resolveOperationSubject(ctx, this.operation({ model: "Webda/User", method: "toString", static: false }), ["u3"]),
      { model: "Webda/User", key: "u3" }
    );
    // Static operation (e.g. User.Login): no single target
    assert.strictEqual(
      resolveOperationSubject(ctx, this.operation({ model: "Webda/User", method: "toString" }), ["u3"]),
      undefined
    );
    // Plain service operation
    assert.strictEqual(
      resolveOperationSubject(ctx, this.operation({ service: "SubjectTarget", method: "create" }), []),
      undefined
    );
  }

  @test
  async eventsCarryTheSubject() {
    const User: any = useModel("Webda/User");
    const tryRegister = (id: string, definition: any) => {
      try {
        registerOperation(id, definition);
      } catch {
        // Already registered by a previous test
      }
    };
    tryRegister("SubjectTest.Create", {
      service: "SubjectTarget",
      method: "create",
      context: { model: User, pkFields: ["uuid"] }
    });
    tryRegister("SubjectTest.Fail", {
      service: "SubjectTarget",
      method: "fail",
      context: { model: User, pkFields: ["uuid"] }
    });
    const seen: { [id: string]: OperationSubject | undefined } = {};
    const offSuccess = useCoreEvents("Webda.OperationSuccess", evt => {
      seen[evt.operationId] = evt.subject;
    });
    const offFailure = useCoreEvents("Webda.OperationFailure", evt => {
      seen[evt.operationId] = evt.subject;
    });
    try {
      await callOperation(new EmptyOpContext(), "SubjectTest.Create");
      const failing = new EmptyOpContext();
      failing.setParameters({ uuid: "u4" });
      await assert.rejects(() => callOperation(failing, "SubjectTest.Fail"), /boom/);
    } finally {
      offSuccess();
      offFailure();
    }
    assert.deepStrictEqual(seen["SubjectTest.Create"], { model: "Webda/User", key: "created-user" });
    assert.deepStrictEqual(seen["SubjectTest.Fail"], { model: "Webda/User", key: "u4" });
  }
}
