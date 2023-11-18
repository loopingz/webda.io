import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import * as crypto from "crypto";
import { WebdaError } from "../errors";
import { Store } from "../stores/store";
import { WebdaTest } from "../test";
import { DomainServiceParameters, ModelsOperationsService, RESTDomainService } from "./domainservice";

@suite
class DomainServiceTest extends WebdaTest {
  getTestConfiguration2(): string | undefined {
    return process.cwd() + "/../../sample-app";
  }

  async after() {
    await this.getService("Users").__clean();
  }

  @test
  async operations() {
    assert.strictEqual(Object.keys(this.webda.listOperations()).length, 0);
    await this.registerService(new ModelsOperationsService(this.webda, "ModelsOperationsService")).resolve().init();
    assert.strictEqual(Object.keys(this.webda.listOperations()).length, 57);
  }

  @test
  async graph() {
    await this.createGraphObjects();
    const rest = await this.registerService(new RESTDomainService(this.webda, "DomainService")).resolve().init();
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
    assert.strictEqual(
      result.results.reduce((total, u) => parseInt(u.name.substring(5)) + total, 0),
      15
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
    await this.http({
      method: "PUT",
      url: `/classrooms/${result.results[0].uuid}/test`,
      body: {
        q: ""
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
    let company = await this.http({
      method: "POST",
      url: "/companies",
      body: {
        test: "test",
        name: "Test 1"
      }
    });
    let company2 = await this.http({
      method: "POST",
      url: "/companies",
      body: {
        test: "test2",
        name: "Test 2"
      }
    });
    assert.notStrictEqual(company.uuid, undefined);
    let user = await this.http({
      method: "POST",
      url: `/companies/${company.uuid}/users`,
      body: {
        displayName: "My User",
        name: "User"
      }
    });
    assert.notStrictEqual(user.uuid, undefined);
    let user2 = await this.http({
      method: "POST",
      url: `/companies/${company2.uuid}/users`,
      body: {
        displayName: "My User",
        name: "User"
      }
    });
    let user3 = await this.http({
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
    rest.walkModel(<any>{ Expose: {} }, "coremodel");
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
    let params = new DomainServiceParameters({
      models: ["!User", "!Company"]
    });
    assert.ok(params.isIncluded("Plop"));
    assert.ok(!params.isIncluded("User"));
    assert.ok(!params.isIncluded("Company"));
    assert.ok(params.isIncluded("Plop2"));
  }

  @test
  async testBinary() {
    // Setup a user
    const rest = await this.registerService(new RESTDomainService(this.webda, "DomainService")).resolve().init();

    // Play with the rest api now
    let company = await this.http({
      method: "POST",
      url: "/companies",
      body: {
        test: "test",
        name: "Test 1"
      }
    });
    assert.notStrictEqual(company.uuid, undefined);
    let user = await this.http({
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
    const userModel: any = await this.webda.getService<Store>("MemoryUsers").get(user.uuid);
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
    await this.http({
      method: "PUT",
      url: `/companies/${company.uuid}/users/${user.uuid}/images`,
      body: {
        hash: hash.digest("hex"),
        challenge: challenge.digest("hex"),
        name: "file.txt"
      }
    });
    await this.http({
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
    let result = await this.http({
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
