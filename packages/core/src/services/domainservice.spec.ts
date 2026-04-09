import { suite, test } from "@webda/test";
import * as assert from "assert";
import { WebdaApplicationTest } from "../test/index.js";
import { DomainServiceParameters } from "./domainservice.js";
import { callOperation, listOperations } from "../core/operations.js";
import { OperationContext } from "../contexts/operationcontext.js";
import * as WebdaError from "../errors/errors.js";
import { useModel } from "../application/hooks.js";
import { MemoryRepository, registerRepository } from "@webda/models";
import type { UuidModel } from "@webda/models";

@suite
class DomainServiceTest extends WebdaApplicationTest {
  getTestConfiguration(): string | undefined {
    return process.cwd() + "/../../sample-app";
  }

  protected async buildWebda() {
    const core = await super.buildWebda();
    // Remove beans
    core.getBeans = () => {};
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
      "Contact.Avatar.Get",
      "Contact.Avatar.GetUrl",
      "Contact.Avatar.SetMetadata",
      "Contact.Create",
      "Contact.Delete",
      "Contact.Get",
      "Contact.Patch",
      "Contact.Photos.Attach",
      "Contact.Photos.AttachChallenge",
      "Contact.Photos.Delete",
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
      "User.Images.Delete",
      "User.Images.Get",
      "User.Images.GetUrl",
      "User.Images.SetMetadata",
      "User.Patch",
      "User.ProfilePicture.Attach",
      "User.ProfilePicture.AttachChallenge",
      "User.ProfilePicture.Delete",
      "User.ProfilePicture.Get",
      "User.ProfilePicture.GetUrl",
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
}
