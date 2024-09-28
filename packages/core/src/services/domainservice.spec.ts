import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import * as crypto from "crypto";
import * as WebdaError from "../errors";
import { WebdaTest } from "../test";
import { DomainServiceParameters, ModelsOperationsService } from "./domainservice";
import { RESTDomainService } from "../rest/restdomainservice";
import { SimpleOperationContext } from "../utils/context";
import { CoreModel } from "../models/coremodel";
import { User } from "../models/user";

@suite
class DomainServiceTest extends WebdaTest {
  getTestConfiguration(): string | undefined {
    return process.cwd() + "/../../sample-app";
  }

  protected async buildWebda(): Promise<void> {
    await super.buildWebda();
    // Remove beans
    this.webda.getBeans = () => {};
  }

  /**
   * TODO Remove
   */
  async after() {
    //await this.getService("Users").__clean();
  }

  async callOperation<T = any>(operationId: string, body: any = "", parameters: any = {}, userId?: string): Promise<T> {
    const context = new SimpleOperationContext(this.webda);
    context.setParameters(parameters);
    if (typeof body === "string") {
      context.setInput(Buffer.from(body));
    } else {
      context.setInput(Buffer.from(JSON.stringify(body)));
    }
    if (userId) {
      await context.newSession();
      context.getSession().login(userId, "test");
    }
    await this.webda.callOperation(context, operationId);
    const output = context.getOutput();
    if (output && output.startsWith("{")) {
      return <T>JSON.parse(output);
    }
    return <T>output;
  }

  @test
  async operations() {
    //assert.strictEqual(Object.keys(this.webda.listOperations()).length, 0);
    //await this.addService(ModelsOperationsService);
    const operations = this.webda.listOperations();
    assert.deepStrictEqual(Object.keys(operations).sort(), [
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
      "ComputerScreen.GlobalAction",
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
      "Student.Create",
      "Student.Delete",
      "Student.Get",
      "Student.Patch",
      "Student.Update",
      "Students.Query",
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
    await assert.rejects(
      () =>
        this.callOperation("ComputerScreen.Create", {
          name: "Test",
          classroom: "fake"
        }),
      /InvalidInput/
    );
    // Test the operations
    const computerScreen = await this.callOperation(
      "ComputerScreen.Create",
      {
        name: "Test",
        classroom: "fake",
        modelId: "fake",
        serialNumber: "123"
      },
      undefined,
      "test"
    );
    assert.strictEqual(computerScreen.name, "Test");
    await assert.rejects(
      () => this.callOperation("ComputerScreen.Get", undefined, { uuid: computerScreen.uuid }),
      /Only test user can access/
    );

    const retrieved = await this.callOperation("ComputerScreen.Get", undefined, { uuid: computerScreen.uuid }, "test");
    assert.strictEqual(retrieved.name, "Test");
    // Test binary
    let user = await this.callOperation("User.Create", {
      name: "Test",
      displayName: "Test"
    });
    await this.callOperation("User.ProfilePicture.Attach", "test", {
      uuid: user.uuid,
      name: "photo.jpg",
      mimetype: "image/jpeg"
    });
    user = await User.ref(user.uuid).get();
    assert.strictEqual(user.profilePicture.name, "photo.jpg");
    assert.strictEqual(user.profilePicture.hash, "098f6bcd4621d373cade4e832627b4f6");
    assert.strictEqual(user.profilePicture.mimetype, "image/jpeg");
  }

  @test
  async graph() {
    await this.createGraphObjects();
    const rest = await this.registerService(
      new RESTDomainService(this.webda, "DomainService", {
        operations: true
      })
    )
      .resolve()
      .init();
    const context = await this.newContext();
    context.getSession().login("test", "test");
    let result = await this.http({
      method: "PUT",
      url: `/companies`,
      body: {
        q: ""
      }
    });
    assert.strictEqual(result.results.length, 2);
    const companies = result.results;
    // Test GET search now
    rest.getParameters().queryMethod = "GET";
    // Reset the routes
    rest.resolve();
    result = await this.http({
      method: "GET",
      url: `/companies`
    });
    assert.strictEqual(result.results.length, 2);
    this.webda.getModel("Company").store().handleModel = () => 0;
    // Reinit the routes
    rest.resolve();
    result = await this.http({
      method: "GET",
      url: `/companies?q=${encodeURIComponent('name="Plop"')}`
    });

    result = await this.http({
      method: "PUT",
      url: `/companies/${companies[0].uuid}/users`,
      body: {
        q: ""
      },
      context
    });
    // We have 5 items so 5+4+3+2+1=15
    assert.strictEqual(
      result.results.reduce((total, u) => parseInt(u.name.substring(5)) + total, 0),
      15
    );
    result = await this.http({
      method: "PUT",
      url: `/companies/${companies[0].uuid}/users`,
      body: {
        q: "LIMIT 3"
      },
      context
    });
    // We have 3 items so 3+2+1=6
    assert.strictEqual(
      result.results.reduce((total, u) => parseInt(u.name.substring(5)) + total, 0),
      6
    );
    result = await this.http({
      method: "PUT",
      url: `/companies/${companies[0].uuid}/users`,
      body: {
        q: `LIMIT 2 OFFSET "${result.continuationToken}"`
      },
      context
    });
    // We should only have 2 items starting from 4
    assert.strictEqual(
      result.results.reduce((total, u) => parseInt(u.name.substring(5)) + total, 0),
      9
    );
    result = await this.http({
      method: "PUT",
      url: `/companies/${companies[1].uuid}/users`,
      body: {
        q: ""
      },
      context
    });
    assert.strictEqual(
      result.results.reduce((total, u) => parseInt(u.name.substring(5)) + total, 0),
      40
    );
    assert.strictEqual(result.results.length, 5);
    let user = result.results[3];
    await this.http({
      method: "PATCH",
      url: `/companies/${companies[1].uuid}/users/${user.uuid}`,
      body: {
        patched: true
      },
      context
    });
    user = await this.http({
      method: "GET",
      url: `/companies/${companies[1].uuid}/users/${user.uuid}`,
      body: {
        q: ""
      },
      context
    });
    assert.strictEqual(user.patched, true);
    await this.http({
      method: "DELETE",
      url: `/companies/${companies[1].uuid}/users/${user.uuid}`,
      body: {
        patched: true
      },
      context
    });
    await assert.rejects(
      () =>
        this.http({
          method: "GET",
          url: `/companies/${companies[1].uuid}/users/${user.uuid}`,
          body: {
            patched: true
          },
          context
        }),
      WebdaError.NotFound
    );
    result = await this.http({
      method: "PUT",
      url: `/companies/${companies[1].uuid}/users`,
      body: {
        q: "name = 'User 8'"
      },
      context
    });
    assert.strictEqual(result.results.length, 1);
    result = await this.http({
      method: "POST",
      url: `/companies/${companies[1].uuid}/users`,
      body: {
        name: "New User",
        displayName: "New User"
      },
      context
    });
    result = await this.http({
      method: "PUT",
      url: `/companies/${companies[1].uuid}/users`,
      body: {
        q: ""
      },
      context
    });
    assert.strictEqual(result.results.length, 5);

    // Play with actions now
    result = await this.http({
      method: "PUT",
      url: `/classrooms`,
      body: {
        q: ""
      },
      context
    });
    await assert.rejects(
      () =>
        this.http({
          method: "PUT",
          url: `/classrooms/${result.results[0].uuid}/test`,
          body: {
            q: ""
          },
          context
        }),
      WebdaError.BadRequest
    );
    await this.http({
      method: "PUT",
      url: `/classrooms/${result.results[0].uuid}/test`,
      body: {
        test: "123",
        id: "123"
      },
      context
    });
    await this.http({
      method: "PUT",
      url: `/classrooms/${result.results[0].uuid}/hardwares/globalAction`,
      body: {
        q: ""
      },
      context
    });
    await this.http({
      method: "PUT",
      url: `/hardwares/globalAction`,
      body: {
        q: ""
      },
      context
    });
    result = await this.http({
      method: "PUT",
      url: `/students`,
      body: {
        q: ""
      },
      context
    });
    assert.strictEqual(result.results.length, 10);
  }

  @test
  async test() {
    const rest = await this.registerService(new RESTDomainService(this.webda, "DomainService")).resolve().init();

    // Play with the rest api now
    const company = await this.http({
      method: "POST",
      url: "/companies",
      body: {
        test: "test",
        name: "Test 1"
      }
    });
    const company2 = await this.http({
      method: "POST",
      url: "/companies",
      body: {
        test: "test2",
        name: "Test 2"
      }
    });
    assert.notStrictEqual(company.uuid, undefined);
    const user = await this.http({
      method: "POST",
      url: `/companies/${company.uuid}/users`,
      body: {
        displayName: "My User",
        name: "User"
      }
    });
    assert.notStrictEqual(user.uuid, undefined);
    const user2 = await this.http({
      method: "POST",
      url: `/companies/${company2.uuid}/users`,
      body: {
        displayName: "My User",
        name: "User"
      }
    });
    const user3 = await this.http({
      method: "POST",
      url: `/companies/${company2.uuid}/users`,
      body: {
        displayName: "My User",
        name: "User"
      }
    });
    let res = await this.http({
      method: "PUT",
      url: `/companies/${company.uuid}/users`,
      body: {
        q: ""
      }
    });
    assert.strictEqual(res.results.length, 1);
    res = await this.http({
      method: "PUT",
      url: `/companies/${company2.uuid}/users`,
      body: {
        q: ""
      }
    });
    assert.strictEqual(res.results.length, 2);

    // Cov part
    rest.handleModel = () => false;
    rest.walkModel(<any>{ Expose: {}, getIdentifier: () => "FakeTest" }, "coremodel");
  }

  @test async deleteAsyncHttp() {
    await this.addService(ModelsOperationsService);
    const company = await this.webda.getModel<CoreModel & { uuid: string }>("Company").create({
      __deleted: true
    });
    await assert.rejects(
      () => this.callOperation("Company.Get", undefined, { uuid: company.uuid }),
      WebdaError.NotFound
    );
    await assert.rejects(
      () => this.callOperation("Company.Put", undefined, { uuid: company.uuid }),
      WebdaError.NotFound
    );
    await assert.rejects(
      () => this.callOperation("Company.Delete", undefined, { uuid: company.uuid }),
      WebdaError.NotFound
    );
  }

  @test
  transformName() {
    const rest = new RESTDomainService(null, "DomainService", {});
    assert.strictEqual(rest.transformName("Users"), "users");
    assert.strictEqual(rest.transformName("Users_Test"), "usersTest");
    assert.strictEqual(rest.transformName("UsersTest"), "usersTest");
    rest.getParameters().nameTransfomer = "lowercase";
    assert.strictEqual(rest.transformName("Users"), "users");
    assert.strictEqual(rest.transformName("Users_Test"), "users_test");
    assert.strictEqual(rest.transformName("UsersTest"), "userstest");
    rest.getParameters().nameTransfomer = "none";
    assert.strictEqual(rest.transformName("Users"), "Users");
    assert.strictEqual(rest.transformName("Users_Test"), "Users_Test");
    assert.strictEqual(rest.transformName("UsersTest"), "UsersTest");
    rest.getParameters().nameTransfomer = "snake_case";
    assert.strictEqual(rest.transformName("Users"), "users");
    assert.strictEqual(rest.transformName("Users_Test"), "users_test");
    assert.strictEqual(rest.transformName("Users-Test"), "users_test");
    assert.strictEqual(rest.transformName("UsersTest"), "users_test");
    assert.strictEqual(rest.transformName("U_Test"), "u_test");
    rest.getParameters().nameTransfomer = "PascalCase";
    assert.strictEqual(rest.transformName("users"), "Users");
    assert.strictEqual(rest.transformName("users_test"), "UsersTest");
    assert.strictEqual(rest.transformName("UsersTest"), "UsersTest");
    rest.getParameters().nameTransfomer = "kebab-case";
    assert.strictEqual(rest.transformName("Users"), "users");
    assert.strictEqual(rest.transformName("Users_Test"), "users-test");
    assert.strictEqual(rest.transformName("UsersTest"), "users-test");
  }

  @test
  async parametersCov() {
    const params = new DomainServiceParameters({
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

  @test
  async testBinary() {
    // Setup a user
    await this.registerService(new RESTDomainService(this.webda, "DomainService")).resolve().init();

    // Play with the rest api now
    const company = await this.http({
      method: "POST",
      url: "/companies",
      body: {
        test: "test",
        name: "Test 1"
      }
    });
    assert.notStrictEqual(company.uuid, undefined);
    const user = await this.http({
      method: "POST",
      url: `/companies/${company.uuid}/users`,
      body: {
        displayName: "My User",
        name: "User"
      }
    });
    assert.notStrictEqual(user.uuid, undefined);
    await this.http({
      method: "POST",
      url: `/companies/${company.uuid}/users/${user.uuid}/profilePicture`,
      body: Buffer.from("test")
    });
    const userModel: any = await User.ref(user.uuid).get();
    await this.http({
      method: "GET",
      url: `/companies/${company.uuid}/users/${user.uuid}/profilePicture`
    });
    const value = "test";
    const hash = crypto.createHash("md5");
    const challenge = crypto.createHash("md5");
    challenge.update("WEBDA");
    hash.update(value);
    challenge.update(value);
    let res = await this.http({
      method: "PUT",
      url: `/companies/${company.uuid}/users/${user.uuid}/images`,
      body: {
        hash: hash.digest("hex"),
        challenge: challenge.digest("hex"),
        name: "file.txt"
      }
    });
    await userModel.refresh();
    res = await this.http({
      method: "POST",
      url: `/companies/${company.uuid}/users/${user.uuid}/images`,
      body: Buffer.from("testImage2"),
      headers: {
        "X-Filename": "file2.txt"
      }
    });
    await userModel.refresh();
    assert.strictEqual(userModel.profilePicture.hash, "098f6bcd4621d373cade4e832627b4f6");
    assert.strictEqual(userModel.images[0].hash, "098f6bcd4621d373cade4e832627b4f6");
    assert.strictEqual(userModel.images[1].hash, "974e716f2142b8df60108602703a8602");
    assert.strictEqual(userModel.images[0].name, "file.txt");
    assert.strictEqual(userModel.images[1].name, "file2.txt");
  }

  @test
  async testOpenApi() {
    const rest = await this.registerService(
      new RESTDomainService(this.webda, "DomainService", { exposeOpenAPI: true, url: "/openapi" })
    )
      .resolve()
      .init();
    const result = await this.http({
      method: "GET",
      url: "/openapi"
    });
    assert.ok(result.includes('spec = {"openapi"'));
    this.webda.getRouter().removeRoute("/openapi");
    rest.getParameters().exposeOpenAPI = false;
    await rest.resolve().init();
    await assert.rejects(
      () =>
        this.http({
          method: "GET",
          url: "/openapi"
        }),
      /route not found/
    );
  }
}
