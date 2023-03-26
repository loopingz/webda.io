import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import { WebdaError } from "../errors";
import { WebdaTest } from "../test";
import { ModelsOperationsService, RESTDomainService } from "./domainservice";

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
    assert.strictEqual(Object.keys(this.webda.listOperations()).length, 51);
    console.log(this.webda.listOperations(), this.webda.getApplication().getSchema("User.Patch"));
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
    assert.strictEqual(rest.transformName("Users"), "users");
    assert.strictEqual(rest.transformName("Users_Test"), "usersTest");
    rest.getParameters().nameTransfomer = "lowercase";
    assert.strictEqual(rest.transformName("Users"), "users");
    assert.strictEqual(rest.transformName("Users_Test"), "users_test");
    rest.getParameters().nameTransfomer = "none";
    assert.strictEqual(rest.transformName("Users"), "Users");
    assert.strictEqual(rest.transformName("Users_Test"), "Users_Test");

    rest.handleModel = () => false;
    rest.walkModel(<any>{ Expose: {} }, "coremodel");
  }
}
