import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import { WebdaTest } from "../test";
import { DomainService } from "./domainservice";

@suite
class DomainServiceTest extends WebdaTest {
  getTestConfiguration2(): string | undefined {
    return process.cwd() + "/../../sample-app";
  }

  async after() {
    await this.getService("Users").__clean();
  }

  @test
  async test() {
    const service = await this.registerService(new DomainService(this.webda, "DomainService", { operations: false }))
      .resolve()
      .init();
    // We should not have any operations
    assert.strictEqual(Object.keys(this.webda.listOperations()).length, 0);
    service.getParameters().operations = true;
    service.initOperations();
    assert.strictEqual(Object.keys(this.webda.listOperations()).length, 51);

    // Play with the rest api now
    let company = await this.http({
      method: "POST",
      url: "/companies",
      body: {
        test: "test"
      }
    });
    let company2 = await this.http({
      method: "POST",
      url: "/companies",
      body: {
        test: "test2"
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
  }
}
