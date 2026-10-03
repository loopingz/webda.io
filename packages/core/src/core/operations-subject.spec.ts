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
  setOperationSubject,
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

  /** Declares its subject by model + key */
  async declareByKey(): Promise<string> {
    setOperationSubject({ model: "Webda/User", key: "declared-key" });
    return "ok";
  }

  /** Declares its subject with a model instance */
  async declareByInstance(): Promise<string> {
    const User: any = useModel("Webda/User");
    const user = new User();
    user.uuid = "declared-instance";
    setOperationSubject(user);
    return "ok";
  }

  /** Declares its subject, then fails */
  async declareThenFail(): Promise<void> {
    setOperationSubject({ model: "Webda/User", key: "declared-failure" });
    throw new Error("declared boom");
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
    // Numeric keys are stringified
    assert.strictEqual(parseSubjectKey(["id"], 5), "5");
    assert.strictEqual(parseSubjectKey(["id"], 0), "0");
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
    const result = new User();
    result.uuid = "new-id";
    assert.deepStrictEqual(resolveOperationSubject(new EmptyOpContext(), op, [], result), {
      model: "Webda/User",
      key: "new-id"
    });
    // A failed Create has neither a key in its input nor a result
    assert.strictEqual(resolveOperationSubject(new EmptyOpContext(), op, []), undefined);
  }

  @test
  async subjectPrefersTheSavedKey() {
    const User: any = useModel("Webda/User");
    const op = this.operation({
      service: "SubjectTarget",
      method: "create",
      context: { model: User, pkFields: ["uuid"] }
    });
    const ctx = new EmptyOpContext();
    ctx.setExtension("operationResolvedInput", { uuid: "asked-id" });
    const saved = new User();
    saved.uuid = "saved-id";
    // Create succeeded under another key than the input one: the saved key is recorded
    assert.deepStrictEqual(resolveOperationSubject(ctx, op, [], saved), { model: "Webda/User", key: "saved-id" });
    // Create failed: only the input key is known
    assert.deepStrictEqual(resolveOperationSubject(ctx, op, []), { model: "Webda/User", key: "asked-id" });
    // A result that is not an instance of the model does not replace the input key
    assert.deepStrictEqual(resolveOperationSubject(ctx, op, [], { getPrimaryKey: () => "other" }), {
      model: "Webda/User",
      key: "asked-id"
    });
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
  async declaredSubjects() {
    const User: any = useModel("Webda/User");
    for (const [id, method, context] of [
      ["Declared.ByKey", "declareByKey", undefined],
      ["Declared.ByInstance", "declareByInstance", undefined],
      ["Declared.Failure", "declareThenFail", undefined],
      // Would derive `derived-key` from the parameters: the declared subject wins
      ["Declared.Override", "declareByKey", { model: User, pkFields: ["uuid"] }]
    ] as const) {
      try {
        registerOperation(id, { service: "SubjectTarget", method, context });
      } catch {
        // Already registered by a previous test
      }
    }
    const seen: { [id: string]: OperationSubject | undefined } = {};
    const record = (evt: { operationId: string; subject?: OperationSubject }) => {
      seen[evt.operationId] = evt.subject;
    };
    const offSuccess = useCoreEvents("Webda.OperationSuccess", record);
    const offFailure = useCoreEvents("Webda.OperationFailure", record);
    try {
      await callOperation(new EmptyOpContext(), "Declared.ByKey");
      await callOperation(new EmptyOpContext(), "Declared.ByInstance");
      await assert.rejects(() => callOperation(new EmptyOpContext(), "Declared.Failure"), /declared boom/);
      const override = new EmptyOpContext();
      override.setParameters({ uuid: "derived-key" });
      await callOperation(override, "Declared.Override");
    } finally {
      offSuccess();
      offFailure();
    }
    assert.deepStrictEqual(seen["Declared.ByKey"], { model: "Webda/User", key: "declared-key" });
    assert.deepStrictEqual(seen["Declared.ByInstance"], { model: "Webda/User", key: "declared-instance" });
    assert.deepStrictEqual(seen["Declared.Failure"], { model: "Webda/User", key: "declared-failure" });
    assert.deepStrictEqual(seen["Declared.Override"], { model: "Webda/User", key: "declared-key" });
  }

  @test
  declaringOutsideAnOperationDoesNothing() {
    assert.doesNotThrow(() => setOperationSubject({ model: "Webda/User", key: "nowhere" }));
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
