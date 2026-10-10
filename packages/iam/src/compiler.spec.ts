import { suite, test } from "@webda/test";
import * as assert from "assert";
import { PolicyCompileError } from "./conditions.js";
import {
  attachmentsFromConfig,
  compileAttachments,
  compilePolicies,
  isValidPrincipal,
  validatePolicyDocument
} from "./compiler.js";

const editor = {
  name: "TaskEditor",
  statements: [
    { sid: "edit", effect: "allow" as const, operations: ["Tasks.*", "Task.Get"], condition: "r.ctx.input.status != 'archived'" },
    { effect: "deny" as const, operations: ["Tasks.Delete"] }
  ]
};

@suite
class CompilerTest {
  @test
  compilesStatements() {
    assert.deepStrictEqual(compilePolicies([editor]), [
      ["policy:TaskEditor", "Tasks.*", "allow", "r.ctx.input.status != 'archived'", "input"],
      ["policy:TaskEditor", "Task.Get", "allow", "r.ctx.input.status != 'archived'", "input"],
      ["policy:TaskEditor", "Tasks.Delete", "deny", "true", ""]
    ]);
  }

  @test
  deduplicatesRows() {
    const doc = {
      name: "Dup",
      statements: [
        { effect: "allow" as const, operations: ["A.B", "A.B"] },
        { effect: "allow" as const, operations: ["A.B"] }
      ]
    };
    assert.deepStrictEqual(compilePolicies([doc]), [["policy:Dup", "A.B", "allow", "true", ""]]);
  }

  @test
  rejectsDuplicateNames() {
    assert.throws(() => compilePolicies([editor, editor]), PolicyCompileError);
  }

  @test
  rejectsInvalidDocuments() {
    for (const doc of [
      undefined,
      {},
      { name: "", statements: [] },
      { name: "X" },
      { name: "X", statements: [{ effect: "maybe", operations: ["*"] }] },
      { name: "X", statements: [{ effect: "allow", operations: [] }] },
      { name: "X", statements: [{ effect: "allow", operations: [""] }] },
      { name: "X", statements: [{ effect: "allow", operations: ["*"], condition: "process.exit()" }] },
      { name: "X", statements: [{ effect: "allow", operations: ["*"], condition: 12 }] }
    ]) {
      assert.throws(() => validatePolicyDocument(doc), PolicyCompileError, JSON.stringify(doc));
    }
    assert.doesNotThrow(() => validatePolicyDocument(editor));
  }

  @test
  principals() {
    for (const principal of ["user:123", "group:admins", "authenticated", "anonymous"]) {
      assert.ok(isValidPrincipal(principal), principal);
    }
    for (const principal of ["", "user:", "group:", "admins", "everyone", "Authenticated"]) {
      assert.ok(!isValidPrincipal(principal), principal);
    }
  }

  @test
  compilesAttachments() {
    const attachments = [
      ...attachmentsFromConfig({ "group:editors": ["TaskEditor", "Missing"], anonymous: ["TaskEditor"] }),
      { principal: "group:editors", policy: "TaskEditor" },
      { principal: "bogus", policy: "TaskEditor" }
    ];
    const { rows, ignored } = compileAttachments(attachments, new Set(["TaskEditor"]));
    assert.deepStrictEqual(rows, [
      ["group:editors", "policy:TaskEditor"],
      ["anonymous", "policy:TaskEditor"]
    ]);
    assert.deepStrictEqual(ignored, [
      { principal: "group:editors", policy: "Missing" },
      { principal: "bogus", policy: "TaskEditor" }
    ]);
  }
}
