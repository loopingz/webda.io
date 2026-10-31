import { suite, test } from "@webda/test";
import * as assert from "assert";
import * as sinon from "sinon";
import { UuidModel, WEBDA_STORAGE } from "@webda/models";
import { WebdaApplicationTest } from "../test/index.js";
import { Router, RouterParameters } from "../rest/router.service.js";
import { RESTOperationsTransport, RESTOperationsTransportParameters } from "../rest/restoperationstransport.service.js";
import { useRouter } from "../rest/hooks.js";
import { WebContext } from "../contexts/webcontext.js";
import { HttpContext } from "../contexts/httpcontext.js";
import { runWithContext } from "../contexts/execution.js";
import { useApplication } from "../application/hooks.js";
import { useInstanceStorage } from "../core/instancestorage.js";
import type { Application } from "../application/application.js";
import { DomainService, DomainServiceParameters } from "./domainservice.service.js";
import { Binary } from "./binary.service.js";
import { hasSchema, registerSchema } from "../schemas/hooks.js";
import * as WebdaError from "../errors/errors.js";

/**
 * Model exposed through the DomainService with a Binary behavior attribute `files`
 */
class FileDoc extends UuidModel {
  files: Binary;
}
FileDoc.registerSerializer();

/**
 * `POST /<plural>/{uuid}/<attribute>/complete/{hash}` goes through the Behavior dispatch: the `<attribute>.complete`
 * permission is checked, then `BinaryService.completeUpload` is reached
 */
@suite
class BinaryCompleteHttpTest extends WebdaApplicationTest {
  getTestConfiguration(): string | undefined {
    return process.cwd() + "/../../sample-app";
  }

  protected async buildWebda() {
    const core = await super.buildWebda();
    core.getBeans = () => {};
    core.registerBeans = () => {};
    useApplication<Application>().addModel("WebdaDemo/FileDoc", FileDoc, {
      Identifier: "WebdaDemo/FileDoc",
      Ancestors: [],
      Subclasses: [],
      Relations: { behaviors: [{ attribute: "files", behavior: "Test/Files" }] },
      PrimaryKey: ["uuid"],
      Events: [],
      Schemas: {},
      Actions: {},
      Import: "",
      Plural: "FileDocs",
      Reflection: {}
    } as any);
    const router = new Router("Router", new RouterParameters().load({}));
    this.registerService(router);
    router.resolve();
    await router.init();
    return core;
  }

  /**
   * Run a request through the Router as `user`
   * @param user - current user id
   * @param url - URL
   * @returns the status code
   */
  async post(user: string | undefined, url: string): Promise<number> {
    const httpContext = new HttpContext("test.webda.io", "POST", url, "http", 80, {});
    httpContext.setClientIp("127.0.0.1");
    const ctx = new WebContext(httpContext);
    ctx.newSession();
    if (user) {
      ctx.getSession().login(user, user);
    }
    let status = 0;
    await runWithContext(ctx, async () => {
      try {
        await useRouter().execute(ctx);
        status = ctx.statusCode;
      } catch (err) {
        if (err instanceof WebdaError.HttpError) {
          status = err.getResponseCode();
        } else {
          throw err;
        }
      }
    });
    return status;
  }

  @test
  async completeIsRoutedAndPermissionChecked() {
    const app = useApplication<Application>() as any;
    const previousBehavior = app.behaviors["Test/Files"];
    const schemaName = "Test/Files.complete.input";
    const schemas = app.getSchemas();
    const previousSchema = schemas[schemaName];
    const schema = {
      type: "object",
      properties: { uuid: { type: "string" }, hash: { type: "string" } },
      required: ["uuid", "hash"]
    };
    app.behaviors["Test/Files"] = {
      metadata: {
        Identifier: "Test/Files",
        Import: "fake:Files",
        Actions: { complete: { rest: { route: "complete/{hash}", method: "POST" } } }
      }
    };
    if (!hasSchema(schemaName)) registerSchema(schemaName, schema);
    schemas[schemaName] = schema;
    const refStub = sinon.stub(FileDoc, "ref");
    try {
      const completeUpload = sinon.stub().resolves();
      const service: any = { completeUpload };
      const user: any = {
        isDeleted: () => false,
        // Anyone may read; only "alice" may complete
        canAct: async (ctx: any, action: string) => action === "get" || ctx.getCurrentUserId() === "alice"
      };
      const binary: any = Object.create(Binary.prototype);
      binary[WEBDA_STORAGE] = { service, __parent__: { instance: user, attribute: "files" }, empty: true };
      Object.assign(binary, { hash: undefined });
      user.files = binary;
      refStub.callsFake(() => ({ get: async () => user }));

      const ops = useInstanceStorage().operations!;
      for (const k of Object.keys(ops)) delete ops[k];
      const domain = new DomainService("DomainService", new DomainServiceParameters().load({}));
      useInstanceStorage().core!.getServices()["DomainService"] = domain;
      domain.initOperations();
      const transport = new RESTOperationsTransport(
        "CompleteTransport",
        new RESTOperationsTransportParameters().load({ url: "/api/", exposeOpenAPI: false })
      );
      this.registerService(transport);
      transport.resolve();
      await transport.init();

      const url = "/api/fileDocs/u1/files/complete/abc123";
      assert.strictEqual(await this.post("bob", url), 403, "caller without the permission is refused");
      assert.strictEqual(completeUpload.callCount, 0);

      assert.strictEqual(await this.post("alice", url), 204, "caller with the permission completes");
      assert.strictEqual(completeUpload.callCount, 1);
      assert.deepStrictEqual(completeUpload.firstCall.args, [user, "files", "abc123"]);
    } finally {
      refStub.restore();
      if (previousBehavior === undefined) delete app.behaviors["Test/Files"];
      else app.behaviors["Test/Files"] = previousBehavior;
      if (previousSchema === undefined) delete schemas[schemaName];
      else schemas[schemaName] = previousSchema;
    }
  }
}
