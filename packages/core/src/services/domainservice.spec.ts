import { suite, test } from "@webda/test";
import * as assert from "assert";
import { WebdaApplicationTest } from "../test/index.js";
import { DomainServiceParameters, DomainService } from "./domainservice.js";
import { callOperation, listOperations } from "../core/operations.js";
import { OperationContext } from "../contexts/operationcontext.js";
import * as WebdaError from "../errors/errors.js";
import { useModel } from "../application/hooks.js";
import { MemoryRepository, registerRepository } from "@webda/models";
import type { UuidModel } from "@webda/models";
import { runWithContext } from "../contexts/execution.js";

/**
 * Fake operation context that allows setting custom input for testing
 */
class FakeOpContext extends OperationContext {
  input: string = "";
  setInput(input: string) {
    this.input = input;
  }

  async getRawInputAsString(
    _limit: number = 1024 * 1024 * 10,
    _timeout: number = 60000,
    _encoding?: string
  ): Promise<string> {
    return this.input;
  }

  async getRawInput(_limit: number = 1024 * 1024 * 10, _timeout: number = 60000): Promise<Buffer> {
    return Buffer.from(this.input);
  }
}

@suite
class DomainServiceTest extends WebdaApplicationTest {
  getTestConfiguration(): string | undefined {
    return process.cwd() + "/../../sample-app";
  }

  protected async buildWebda() {
    const core = await super.buildWebda();
    // Remove beans
    core.getBeans = () => {};
    core.registerBeans = () => {};
    return core;
  }

  @test
  async operations() {
    const operations = listOperations();
    assert.deepStrictEqual(Object.keys(operations).sort(), [
      "AbstractProject.Create",
      "AbstractProject.Delete",
      "AbstractProject.Get",
      "AbstractProject.Patch",
      "AbstractProject.Update",
      "AbstractProjects.Query",
      "AnotherSubProject.Create",
      "AnotherSubProject.Delete",
      "AnotherSubProject.Get",
      "AnotherSubProject.Patch",
      "AnotherSubProject.Update",
      "AnotherSubProjects.Query",
      "Brand.Create",
      "Brand.Delete",
      "Brand.Get",
      "Brand.Patch",
      "Brand.Update",
      "Brands.Query",
      "Classroom.Create",
      "Classroom.Delete",
      "Classroom.Get",
      "Classroom.Patch",
      "Classroom.Test",
      "Classroom.Update",
      "Classrooms.Query",
      "Companies.Query",
      "Company.Create",
      "Company.Delete",
      "Company.Get",
      "Company.Patch",
      "Company.Update",
      "Computer.Create",
      "Computer.Delete",
      "Computer.Get",
      "Computer.Patch",
      "Computer.Update",
      "ComputerScreen.Create",
      "ComputerScreen.Delete",
      "ComputerScreen.Get",
      "ComputerScreen.Patch",
      "ComputerScreen.Update",
      "ComputerScreens.Query",
      "Computers.Query",
      "Contact.Avatar.Attach",
      "Contact.Avatar.AttachChallenge",
      "Contact.Avatar.Delete",
      "Contact.Avatar.Download",
      "Contact.Avatar.DownloadUrl",
      "Contact.Avatar.SetMetadata",
      "Contact.Create",
      "Contact.Delete",
      "Contact.Get",
      "Contact.Patch",
      "Contact.Photos.Attach",
      "Contact.Photos.AttachChallenge",
      "Contact.Photos.DeleteAt",
      "Contact.Photos.Get",
      "Contact.Photos.GetUrl",
      "Contact.Photos.SetMetadata",
      "Contact.Update",
      "Contacts.Query",
      "Course.Create",
      "Course.Delete",
      "Course.Get",
      "Course.Patch",
      "Course.Update",
      "Courses.Query",
      "Hardware.Create",
      "Hardware.Delete",
      "Hardware.Get",
      "Hardware.GlobalAction",
      "Hardware.Patch",
      "Hardware.Update",
      "Hardwares.Query",
      "Project.Create",
      "Project.Delete",
      "Project.Get",
      "Project.Patch",
      "Project.Update",
      "Projects.Query",
      "Student.Create",
      "Student.Delete",
      "Student.Get",
      "Student.Patch",
      "Student.Update",
      "Students.Query",
      "SubProject.Create",
      "SubProject.Delete",
      "SubProject.Get",
      "SubProject.Patch",
      "SubProject.Update",
      "SubProjects.Query",
      "SubSubProject.Action",
      "SubSubProject.Action2",
      "SubSubProject.Action3",
      "SubSubProject.Action4",
      "SubSubProject.Create",
      "SubSubProject.Delete",
      "SubSubProject.Get",
      "SubSubProject.Patch",
      "SubSubProject.Update",
      "SubSubProjects.Query",
      "Teacher.Create",
      "Teacher.Delete",
      "Teacher.Get",
      "Teacher.Patch",
      "Teacher.Update",
      "Teachers.Query",
      "User.Create",
      "User.Delete",
      "User.Get",
      "User.Images.Attach",
      "User.Images.AttachChallenge",
      "User.Images.DeleteAt",
      "User.Images.Get",
      "User.Images.GetUrl",
      "User.Images.SetMetadata",
      "User.Patch",
      "User.ProfilePicture.Attach",
      "User.ProfilePicture.AttachChallenge",
      "User.ProfilePicture.Delete",
      "User.ProfilePicture.Download",
      "User.ProfilePicture.DownloadUrl",
      "User.ProfilePicture.SetMetadata",
      "User.Update",
      "Users.Query"
    ]);

    // Verify enriched metadata fields
    const userCreate = operations["User.Create"];
    assert.strictEqual(userCreate.summary, "Create a new User");
    assert.deepStrictEqual(userCreate.tags, ["User"]);
    assert.deepStrictEqual(userCreate.rest, { method: "post", path: "" });

    const userGet = operations["User.Get"];
    assert.strictEqual(userGet.summary, "Retrieve a User");
    assert.deepStrictEqual(userGet.rest, { method: "get", path: "{uuid}" });

    const userDelete = operations["User.Delete"];
    assert.deepStrictEqual(userDelete.rest, { method: "delete", path: "{uuid}" });

    const usersQuery = operations["Users.Query"];
    assert.deepStrictEqual(usersQuery.rest, { method: "put", path: "" });
    assert.deepStrictEqual(usersQuery.tags, ["User"]);

    const userPatch = operations["User.Patch"];
    assert.deepStrictEqual(userPatch.rest, { method: "patch", path: "{uuid}" });

    // Verify custom action metadata
    const classroomTest = operations["Classroom.Test"];
    assert.ok(classroomTest);
    assert.deepStrictEqual(classroomTest.tags, ["Classroom"]);
    assert.ok(classroomTest.summary.includes("Classroom"));

    const hwGlobal = operations["Hardware.GlobalAction"];
    assert.ok(hwGlobal);
    assert.deepStrictEqual(hwGlobal.tags, ["Hardware"]);
    assert.ok(hwGlobal.rest);
  }

  @test async deleteAsyncHttp() {
    const Contact = useModel<UuidModel & { firstName: string }>("Contact");
    // Register a MemoryRepository so Contact model operations work
    const repo = new MemoryRepository(Contact, ["uuid"]);
    registerRepository(Contact, repo);
    // Create then delete so the object no longer exists
    const uuid = "test-deleted-contact-uuid";
    await Contact.create({ uuid, firstName: "deleted" } as any);
    await repo.delete(uuid);
    const getCtx = new OperationContext();
    await getCtx.init();
    getCtx.setParameters({ uuid });
    await assert.rejects(() => callOperation(getCtx, "Contact.Get"), WebdaError.NotFound);
    const deleteCtx = new OperationContext();
    await deleteCtx.init();
    deleteCtx.setParameters({ uuid });
    await assert.rejects(() => callOperation(deleteCtx, "Contact.Delete"), WebdaError.NotFound);
  }

  @test
  async parametersCov() {
    const params = new DomainServiceParameters().load({
      models: ["!User", "!Company"]
    });
    assert.ok(params.isIncluded("Plop"));
    assert.ok(!params.isIncluded("User"));
    assert.ok(!params.isIncluded("Company"));
    assert.ok(params.isIncluded("Plop2"));
    assert.ok(!params.isExcluded("Plop"));
    assert.ok(params.isExcluded("User"));
    assert.ok(params.isExcluded("Company"));
    assert.ok(!params.isExcluded("Plop2"));
  }

  /**
   * Helper to set up a Brand model with a MemoryRepository
   */
  private setupBrandRepo() {
    const Brand = useModel<UuidModel & { name: string }>("Brand");
    const repo = new MemoryRepository(Brand, ["uuid"]);
    registerRepository(Brand, repo);
    return { Brand, repo };
  }

  /**
   * Helper to set up all models needed for Classroom (which has relations)
   */
  private setupClassroomRepos() {
    const Classroom = useModel<UuidModel>("Classroom");
    const Course = useModel<UuidModel>("Course");
    const Hardware = useModel<UuidModel>("Hardware");
    const Brand = useModel<UuidModel>("Brand");
    const Student = useModel<UuidModel>("Student");
    const Teacher = useModel<UuidModel>("Teacher");
    registerRepository(Classroom, new MemoryRepository(Classroom, ["uuid"]));
    registerRepository(Course, new MemoryRepository(Course, ["uuid"]));
    registerRepository(Hardware, new MemoryRepository(Hardware, ["uuid"]));
    registerRepository(Brand, new MemoryRepository(Brand, ["uuid"]));
    registerRepository(Student, new MemoryRepository(Student, ["email"]));
    registerRepository(Teacher, new MemoryRepository(Teacher, ["uuid"]));
    return { Classroom, Course, Hardware };
  }

  @test
  async modelCreateWithInput() {
    const { Brand } = this.setupBrandRepo();
    const ctx = new FakeOpContext();
    await ctx.init();
    ctx.setInput(JSON.stringify({ name: "TestBrand" }));
    await callOperation(ctx, "Brand.Create");
    // Verify the output was written (Brand.Create returns the created model)
    const output = ctx.getOutput();
    assert.ok(output, "Output should have been written");
  }

  @test
  async modelGetWithUuid() {
    const { Brand, repo } = this.setupBrandRepo();
    const uuid = "get-test-uuid";
    await Brand.create({ uuid, name: "GetBrand" } as any);
    const ctx = new FakeOpContext();
    await ctx.init();
    ctx.setParameters({ uuid });
    await callOperation(ctx, "Brand.Get");
    const output = ctx.getOutput();
    assert.ok(output, "Output should have been written for Get");
    const parsed = JSON.parse(output);
    assert.strictEqual(parsed.uuid, uuid);
  }

  @test
  async modelUpdateWithUuidAndInput() {
    const { Brand, repo } = this.setupBrandRepo();
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    await Brand.create({ uuid, name: "Before" } as any);
    const ctx = new FakeOpContext();
    await ctx.init();
    ctx.setParameters({ uuid });
    ctx.setInput(JSON.stringify({ uuid, name: "After" }));
    await callOperation(ctx, "Brand.Update");
    const output = ctx.getOutput();
    assert.ok(output, "Output should have been written for Update");
  }

  @test
  async modelPatchWithUuidAndInput() {
    const { Brand, repo } = this.setupBrandRepo();
    const uuid = "550e8400-e29b-41d4-a716-446655440001";
    await Brand.create({ uuid, name: "Original" } as any);
    const ctx = new FakeOpContext();
    await ctx.init();
    ctx.setParameters({ uuid });
    ctx.setInput(JSON.stringify({ uuid, name: "Patched" }));
    await callOperation(ctx, "Brand.Patch");
    const output = ctx.getOutput();
    assert.ok(output, "Output should have been written for Patch");
    // Verify the patch was applied in the repo
    const patched = await repo.get(uuid);
    assert.strictEqual((patched as any).name, "Patched");
  }

  @test
  async modelDeleteWithUuid() {
    const { Brand, repo } = this.setupBrandRepo();
    const uuid = "delete-test-uuid";
    await Brand.create({ uuid, name: "ToDelete" } as any);
    const ctx = new FakeOpContext();
    await ctx.init();
    ctx.setParameters({ uuid });
    await callOperation(ctx, "Brand.Delete");
    // Verify the object was deleted - MemoryRepository throws on get for missing
    let found = false;
    try {
      const obj = await repo.get(uuid);
      // If we get here, check if it's marked as deleted
      found = obj !== undefined && !obj.isDeleted();
    } catch {
      // Object not found means it was deleted
    }
    assert.ok(!found, "Object should be deleted");
  }

  @test
  async modelQueryWithQueryString() {
    const { Brand } = this.setupBrandRepo();
    await Brand.create({ uuid: "q1", name: "Alice" } as any);
    await Brand.create({ uuid: "q2", name: "Bob" } as any);
    const ctx = new FakeOpContext();
    await ctx.init();
    ctx.setParameters({ query: "" });
    await callOperation(ctx, "Brands.Query");
    const output = ctx.getOutput();
    assert.ok(output);
    const parsed = JSON.parse(output);
    assert.ok(parsed.results);
    assert.ok(parsed.results.length >= 2);
  }

  @test
  async modelActionGlobal() {
    // Hardware.GlobalAction is a global static action
    // The action schemas have broken $ref that cause AJV errors,
    // so we remove the input schema registration to test the action path itself
    const { Hardware } = this.setupClassroomRepos();
    const { useInstanceStorage: getStorage } = await import("../core/instancestorage.js");
    const op = getStorage().operations["Hardware.GlobalAction"];
    const savedInput = op.input;
    op.input = "void";
    try {
      const ctx = new FakeOpContext();
      await ctx.init();
      await callOperation(ctx, "Hardware.GlobalAction");
      // The globalAction writes {} to context
      const output = ctx.getOutput();
      assert.ok(output !== undefined);
    } finally {
      op.input = savedInput;
    }
  }

  @test
  async modelActionInstance() {
    // Classroom.Test is an instance action
    const { Classroom } = this.setupClassroomRepos();
    const uuid = "550e8400-e29b-41d4-a716-446655440001";
    await Classroom.create({ uuid, name: "Room101" } as any);

    const ctx = new FakeOpContext();
    await ctx.init();
    ctx.setParameters({ uuid });
    await callOperation(ctx, "Classroom.Test");
    const output = ctx.getOutput();
    assert.ok(output !== undefined);
  }

  @test
  async modelActionInstanceNotFound() {
    // Instance action on a non-existent object should throw
    // The modelAction method catches the repository error and throws NotFound,
    // but if the repo throws first (MemoryRepository), that error propagates
    this.setupClassroomRepos();

    const ctx = new FakeOpContext();
    await ctx.init();
    ctx.setParameters({ uuid: "nonexistent-uuid" });
    await assert.rejects(() => callOperation(ctx, "Classroom.Test"), /not found|Not found|Object not found/i);
  }

  @test
  async modelGetNotFound() {
    // Get on a non-existent uuid should throw NotFound
    this.setupBrandRepo();
    const ctx = new FakeOpContext();
    await ctx.init();
    ctx.setParameters({ uuid: "does-not-exist" });
    await assert.rejects(() => callOperation(ctx, "Brand.Get"), WebdaError.NotFound);
  }

  @test
  async modelDeleteNotFound() {
    // Delete on a non-existent uuid should throw NotFound
    this.setupBrandRepo();
    const ctx = new FakeOpContext();
    await ctx.init();
    ctx.setParameters({ uuid: "does-not-exist" });
    await assert.rejects(() => callOperation(ctx, "Brand.Delete"), WebdaError.NotFound);
  }

  @test
  async modelUpdateNotFound() {
    // Update on a non-existent uuid should throw NotFound
    this.setupBrandRepo();
    const uuid = "550e8400-e29b-41d4-a716-446655440099";
    const ctx = new FakeOpContext();
    await ctx.init();
    ctx.setParameters({ uuid });
    ctx.setInput(JSON.stringify({ uuid, name: "Nope" }));
    await assert.rejects(() => callOperation(ctx, "Brand.Update"), WebdaError.NotFound);
  }

  @test
  async modelPatchNotFound() {
    // Patch on a non-existent uuid should throw NotFound
    this.setupBrandRepo();
    const ctx = new FakeOpContext();
    await ctx.init();
    const uuid = "550e8400-e29b-41d4-a716-446655440099";
    ctx.setParameters({ uuid });
    ctx.setInput(JSON.stringify({ uuid, name: "Nope" }));
    await assert.rejects(() => callOperation(ctx, "Brand.Patch"), WebdaError.NotFound);
  }

  @test
  async modelQuerySyntaxError() {
    // Query with invalid syntax should throw BadRequest
    this.setupBrandRepo();
    const ctx = new FakeOpContext();
    await ctx.init();
    // Use an invalid query that triggers SyntaxError in the query parser
    ctx.setParameters({ query: "INVALID ~~~ QUERY" });
    await assert.rejects(() => callOperation(ctx, "Brands.Query"), WebdaError.BadRequest);
  }

  @test
  async modelCreateWithContextFallback() {
    // Test the path where input is undefined (no input schema) and falls back to context.getInput()
    const { Brand } = this.setupBrandRepo();
    const { useInstanceStorage: getStorage } = await import("../core/instancestorage.js");
    const op = getStorage().operations["Brand.Create"];
    // Temporarily set input to "void" to force context fallback
    const savedInput = op.input;
    op.input = "void";
    try {
      const ctx = new FakeOpContext();
      await ctx.init();
      ctx.setInput(JSON.stringify({ name: "FallbackCreate" }));
      await callOperation(ctx, "Brand.Create");
      const output = ctx.getOutput();
      assert.ok(output, "Create with context fallback should produce output");
    } finally {
      op.input = savedInput;
    }
  }

  @test
  async modelUpdateWithInputFallback() {
    // Test modelUpdate when input argument is undefined (falls back to context.getInput)
    const { Brand, repo } = this.setupBrandRepo();
    const uuid = "550e8400-e29b-41d4-a716-446655440002";
    await Brand.create({ uuid, name: "BeforeFallback" } as any);
    const { useInstanceStorage: getStorage } = await import("../core/instancestorage.js");
    const op = getStorage().operations["Brand.Update"];
    // Set input to "void" so resolveArguments can't extract the body
    const savedInput = op.input;
    op.input = "void";
    try {
      const ctx = new FakeOpContext();
      await ctx.init();
      ctx.setParameters({ uuid });
      ctx.setInput(JSON.stringify({ uuid, name: "AfterFallback" }));
      await callOperation(ctx, "Brand.Update");
      const output = ctx.getOutput();
      assert.ok(output, "Update with fallback should produce output");
    } finally {
      op.input = savedInput;
    }
  }

  @test
  async modelPatchWithInputFallback() {
    // Test modelPatch when resolveArguments passes the body as the first arg
    // (because the "ModelKey?" schema isn't in the registry with the ? suffix).
    // modelPatch detects this case and reads uuid from context params instead.
    const { Brand, repo } = this.setupBrandRepo();
    const uuid = "550e8400-e29b-41d4-a716-446655440002";
    await Brand.create({ uuid, name: "BeforePatchFallback" } as any);

    const ctx = new FakeOpContext();
    await ctx.init();
    ctx.setParameters({ uuid });
    ctx.setInput(JSON.stringify({ uuid, name: "PatchedFallback" }));
    await callOperation(ctx, "Brand.Patch");
    const output = ctx.getOutput();
    assert.ok(output, "Patch with fallback should produce output");
    const patched = await repo.get(uuid);
    assert.strictEqual((patched as any).name, "PatchedFallback");
  }

  @test
  async modelUpdateWithMultiFieldPkFromParams() {
    // pkFields with multiple entries triggers the reduce branch: PK is built as an
    // object from URL params when the body lacks those fields. Call modelUpdate
    // directly to bypass the schema validator and hit the pk-assembly code.
    const { Brand } = this.setupBrandRepo();
    const service = new (await import("./domainservice.js")).DomainService(
      "DomainService",
      new DomainServiceParameters().load({})
    );
    const ctx = new FakeOpContext();
    await ctx.init();
    ctx.setExtension("operationContext", { model: Brand, pkFields: ["namespace", "slug"] });
    ctx.setParameters({ namespace: "ns-1", slug: "my-brand" });
    ctx.setInput(JSON.stringify({ name: "Updated" }));
    await runWithContext(ctx, async () => {
      await assert.rejects(
        () => service.modelUpdate({ name: "Updated" }),
        WebdaError.NotFound
      );
    });
  }

  @test
  async modelPatchWithSingleNonUuidPkField() {
    // pkFields=["slug"] triggers the single-field branch with a non-uuid PK.
    const { Brand } = this.setupBrandRepo();
    const service = new (await import("./domainservice.js")).DomainService(
      "DomainService",
      new DomainServiceParameters().load({})
    );
    const ctx = new FakeOpContext();
    await ctx.init();
    ctx.setExtension("operationContext", { model: Brand, pkFields: ["slug"] });
    ctx.setParameters({ slug: "does-not-exist" });
    ctx.setInput(JSON.stringify({ name: "NopePatched" }));
    await runWithContext(ctx, async () => {
      await assert.rejects(
        () => service.modelPatch({ name: "NopePatched" }),
        WebdaError.NotFound
      );
    });
  }

  @test
  async modelCreateRejectsScalarInputByReadingContext() {
    // When the first arg is a scalar, modelCreate detects it isn't an object
    // and falls back to context.getInput().
    const { Brand } = this.setupBrandRepo();
    const service = new (await import("./domainservice.js")).DomainService(
      "DomainService",
      new DomainServiceParameters().load({})
    );
    const ctx = new FakeOpContext();
    await ctx.init();
    ctx.setExtension("operationContext", { model: Brand });
    ctx.setInput(JSON.stringify({ name: "ScalarFallback" }));
    let created: any;
    await runWithContext(ctx, async () => {
      // Pass a scalar string — typeof "scalar" !== "object", so the code
      // re-reads the body from context.getInput().
      created = await service.modelCreate("a-scalar-pk-value");
    });
    assert.strictEqual(created.name, "ScalarFallback");
  }

  @test
  async loadModelWithObjectPkSerializesForEvent() {
    // loadModel receives a non-string PK — on NotFound, the emitted event uses
    // JSON.stringify of the object so the event bus gets a loggable key.
    const service = new (await import("./domainservice.js")).DomainService(
      "DomainService",
      new DomainServiceParameters().load({})
    );
    const events: any[] = [];
    service.on("Store.WebNotFound", (evt: any) => events.push(evt));
    const { Brand } = this.setupBrandRepo();
    const ctx = new FakeOpContext();
    await ctx.init();
    await runWithContext(ctx, async () => {
      await assert.rejects(
        () => (service as any).loadModel(Brand, { namespace: "x", slug: "y" }),
        WebdaError.NotFound
      );
    });
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].uuid, JSON.stringify({ namespace: "x", slug: "y" }));
  }
}
