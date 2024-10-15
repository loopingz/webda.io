import * as assert from "assert";
import { WebdaApplicationTest } from "../test/test";
import { Store, Ident, User, WebdaError } from "../index";

class RESTDomainServiceTest extends WebdaApplicationTest {
  async httpCRUD(url: string = "/users") {
    let eventFired;
    const userStore: Store = User.store();
    let executor;
    await userStore.__clean();
    const ctx = await this.newContext({});
    ctx.getSession().login("PLOP", "fake_ident");
    executor = this.getExecutor(ctx, "test.webda.io", "POST", url, {
      type: "CRUD",
      uuid: "PLOP",
      displayName: "Coucou"
    });
    assert.notStrictEqual(executor, undefined);
    await executor.execute(ctx);
    assert.strictEqual(ctx.statusCode, 201);
    assert.strictEqual(ctx.getResponseHeaders().Location, `http://test.webda.io/${url}/PLOP`);
    ctx["body"] = undefined;
    assert.strictEqual((await userStore.getAll()).length, 1);
    await this.getExecutor(ctx, "test.webda.io", "GET", `${url}/PLOP`).execute(ctx);
    assert.notStrictEqual(ctx.getResponseBody(), undefined);
    assert.strictEqual(ctx.getResponseBody().indexOf("_lastUpdate") >= 0, true);
    executor = this.getExecutor(ctx, "test.webda.io", "POST", url, {
      type: "CRUD2",
      uuid: "PLOP",
      displayName: "Coucou 2"
    });
    await assert.rejects(executor.execute(ctx), (err: WebdaError.HttpError) => err.getResponseCode() === 409);
    // Verify the none overide of UUID
    await this.execute(ctx, "test.webda.io", "PUT", `${url}/PLOP`, {
      type: "CRUD2",
      additional: "field",
      uuid: "PLOP2",
      user: "fake_user",
      displayName: "Coucou 3",
      roles: []
    });
    let user: any = await userStore.get("PLOP");
    assert.strictEqual(user.getUuid(), "PLOP");
    assert.strictEqual(user.type, "CRUD2");
    assert.strictEqual(user.additional, "field");
    assert.strictEqual(user.user, "fake_user");

    // Add a role to the user
    user.roles.push("plop");
    await user.save();

    user = await userStore.get("PLOP");
    assert.deepStrictEqual(user.roles, ["plop"]);

    ctx.resetResponse();
    // Check PATH
    await this.execute(ctx, "test.webda.io", "PATCH", `${url}/PLOP`, {
      type: "CRUD3",
      uuid: "PLOP2",
      _testor: "_ should not be update by client"
    });
    user = await userStore.get("PLOP");
    assert.strictEqual(user.uuid, "PLOP");
    assert.strictEqual(user.type, "CRUD3");
    assert.strictEqual(user.additional, "field");
    assert.strictEqual(user._testor, undefined);
    assert.deepStrictEqual(user.roles, ["plop"]);

    executor = this.getExecutor(ctx, "test.webda.io", "PUT", `${url}/PLOP`, {
      type: "CRUD3",
      uuid: "PLOP2",
      _testor: "_ should not be update by client",
      displayName: "yep"
    });
    await executor.execute(ctx);
    user = await userStore.get("PLOP");
    assert.strictEqual(user.uuid, "PLOP");
    assert.strictEqual(user.type, "CRUD3");
    assert.strictEqual(user.additional, undefined);
    assert.strictEqual(user._testor, undefined);
    assert.deepStrictEqual(user.roles, undefined);

    await this.getExecutor(ctx, "test.webda.io", "DELETE", `${url}/PLOP`).execute(ctx);
    eventFired = 0;
    executor = this.getExecutor(ctx, "test.webda.io", "GET", `${url}/PLOP`);
    await assert.rejects(() => executor.execute(ctx), WebdaError.NotFound);
    eventFired++;
    executor = this.getExecutor(ctx, "test.webda.io", "DELETE", `${url}/PLOP`);
    await assert.rejects(() => executor.execute(ctx), WebdaError.NotFound);
    eventFired++;
    executor = this.getExecutor(ctx, "test.webda.io", "PUT", `${url}/PLOP`);
    await assert.rejects(() => executor.execute(ctx), WebdaError.NotFound);
    eventFired++;
    assert.strictEqual(eventFired, 3);
  }

  async modelActions(url = "/idents") {
    const identStore: Store = Ident.store();
    assert.notStrictEqual(identStore.getModel(), undefined);
    let executor;
    const ctx = await this.newContext({
      type: "CRUD",
      uuid: "PLOP"
    });
    executor = this.getExecutor(ctx, "test.webda.io", "PUT", `${url}/coucou/plop`);
    assert.notStrictEqual(executor, undefined);
    await assert.rejects(executor.execute(ctx), WebdaError.NotFound);
    await identStore.create("coucou", {
      uuid: "coucou"
    });
    await executor.execute(ctx);
    // Our fake action is pushing true to _plop
    assert.strictEqual(JSON.parse(ctx.getResponseBody())._plop, true);

    assert.notStrictEqual(this.getExecutor(ctx, "test.webda.io", "POST", `${url}/coucou/yop`), null);
    executor = this.getExecutor(ctx, "test.webda.io", "GET", `${url}/coucou/yop`);
    assert.notStrictEqual(executor, null);

    // Test with action returning the result instead of writing it
    ctx.resetResponse();
    await executor.execute(ctx);
    assert.strictEqual(ctx.getResponseBody(), "youpi");
  }
}
