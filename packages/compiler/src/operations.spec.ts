import { suite, test } from "@webda/test";
import * as assert from "assert";
import { generateOperations, OperationsExportFormat } from "./operations";
import { WebdaModule } from "./definition";

@suite
class OperationsTest {
  @test
  async generateFromModels() {
    const mod: WebdaModule = {
      beans: {},
      deployers: {},
      moddas: {},
      models: {
        "MyApp/Task": {
          Identifier: "MyApp/Task",
          Import: "lib/task:Task",
          Plural: "Tasks",
          Relations: {},
          Ancestors: [],
          Subclasses: [],
          PrimaryKey: ["uuid"],
          Events: [],
          Reflection: {},
          Schemas: {
            Input: { type: "object", properties: { title: { type: "string" } } }
          },
          Actions: {
            create: {},
            update: {},
            delete: {},
            get: {},
            query: {},
            archive: {},
            publish: { global: true, description: "Publish all tasks" }
          }
        }
      },
      schemas: {
        "MyApp/Task.archive.input": { type: "object", properties: { reason: { type: "string" } } },
        "MyApp/Task.archive.output": { type: "object", properties: { success: { type: "boolean" } } },
        "MyApp/Task.publish.input": { type: "object", properties: { target: { type: "string" } } },
        "MyApp/Task.publish.output": { type: "object", properties: { count: { type: "number" } } }
      }
    };

    const result = generateOperations(mod);

    // CRUD operations
    assert.notStrictEqual(result.operations["Task.Create"], undefined, "Create operation should exist");
    assert.strictEqual(result.operations["Task.Create"].input, "MyApp/Task");
    assert.strictEqual(result.operations["Task.Create"].output, "MyApp/Task");

    assert.notStrictEqual(result.operations["Task.Update"], undefined, "Update operation should exist");
    assert.strictEqual(result.operations["Task.Update"].input, "MyApp/Task");
    assert.strictEqual(result.operations["Task.Update"].parameters, "uuidRequest");

    assert.notStrictEqual(result.operations["Task.Patch"], undefined, "Patch operation should exist");
    assert.strictEqual(result.operations["Task.Patch"].input, "MyApp/Task?");

    assert.notStrictEqual(result.operations["Task.Delete"], undefined, "Delete operation should exist");
    assert.strictEqual(result.operations["Task.Delete"].parameters, "uuidRequest");
    assert.strictEqual(result.operations["Task.Delete"].input, undefined);

    assert.notStrictEqual(result.operations["Task.Get"], undefined, "Get operation should exist");
    assert.strictEqual(result.operations["Task.Get"].output, "MyApp/Task");

    assert.notStrictEqual(result.operations["Tasks.Query"], undefined, "Query operation should exist");
    assert.strictEqual(result.operations["Tasks.Query"].parameters, "searchRequest");

    // Custom action (instance)
    assert.notStrictEqual(result.operations["Task.Archive"], undefined, "Archive operation should exist");
    assert.strictEqual(result.operations["Task.Archive"].input, "MyApp/Task.archive.input");
    assert.strictEqual(result.operations["Task.Archive"].output, "MyApp/Task.archive.output");
    assert.strictEqual(result.operations["Task.Archive"].parameters, "uuidRequest");

    // Custom action (global/static)
    assert.notStrictEqual(result.operations["Task.Publish"], undefined, "Publish operation should exist");
    assert.strictEqual(result.operations["Task.Publish"].input, "MyApp/Task.publish.input");
    assert.strictEqual(result.operations["Task.Publish"].output, "MyApp/Task.publish.output");
    assert.strictEqual(result.operations["Task.Publish"].parameters, undefined);

    // Schemas should include referenced schemas
    assert.notStrictEqual(result.schemas["MyApp/Task.archive.input"], undefined);
    assert.notStrictEqual(result.schemas["MyApp/Task.archive.output"], undefined);
    assert.notStrictEqual(result.schemas["MyApp/Task.publish.input"], undefined);
    assert.notStrictEqual(result.schemas["MyApp/Task"], undefined, "Model input schema should be included");
  }

  @test
  async generateFromServices() {
    const mod: WebdaModule = {
      beans: {
        "MyApp/NotificationService": {
          Import: "lib/notification:NotificationService",
          Schema: {}
        }
      },
      deployers: {},
      moddas: {
        "MyApp/Publisher": {
          Import: "lib/publisher:Publisher",
          Schema: {}
        }
      },
      models: {},
      schemas: {
        "NotificationService.sendAlert.input": { type: "object", properties: { message: { type: "string" } } },
        "NotificationService.sendAlert.output": { type: "object", properties: { sent: { type: "boolean" } } },
        "Publisher.publish.input": { type: "object", properties: { content: { type: "string" } } },
        "Publisher.publish.output": { type: "object", properties: { url: { type: "string" } } }
      }
    };

    const result = generateOperations(mod);

    // Bean operation
    assert.notStrictEqual(
      result.operations["NotificationService.SendAlert"],
      undefined,
      "Bean operation should exist"
    );
    assert.strictEqual(result.operations["NotificationService.SendAlert"].input, "NotificationService.sendAlert.input");
    assert.strictEqual(
      result.operations["NotificationService.SendAlert"].output,
      "NotificationService.sendAlert.output"
    );

    // Modda operation
    assert.notStrictEqual(result.operations["Publisher.Publish"], undefined, "Modda operation should exist");
    assert.strictEqual(result.operations["Publisher.Publish"].input, "Publisher.publish.input");
    assert.strictEqual(result.operations["Publisher.Publish"].output, "Publisher.publish.output");

    // Schemas should be included
    assert.notStrictEqual(result.schemas["NotificationService.sendAlert.input"], undefined);
    assert.notStrictEqual(result.schemas["Publisher.publish.output"], undefined);
  }

  @test
  async generateEmpty() {
    const mod: WebdaModule = {
      beans: {},
      deployers: {},
      moddas: {},
      models: {},
      schemas: {}
    };

    const result = generateOperations(mod);
    assert.deepStrictEqual(result.operations, {});
    assert.deepStrictEqual(result.schemas, {});
  }

  @test
  async generateMixed() {
    // Test with both models and services
    const mod: WebdaModule = {
      beans: {
        "MyApp/Mailer": { Import: "lib/mailer:Mailer", Schema: {} }
      },
      deployers: {},
      moddas: {},
      models: {
        "MyApp/User": {
          Identifier: "MyApp/User",
          Import: "lib/user:User",
          Plural: "Users",
          Relations: {},
          Ancestors: [],
          Subclasses: [],
          PrimaryKey: ["uuid"],
          Events: [],
          Reflection: {},
          Schemas: {
            Input: { type: "object", properties: { name: { type: "string" } } }
          },
          Actions: {
            get: {},
            login: { global: true }
          }
        }
      },
      schemas: {
        "MyApp/User.login.input": { type: "object", properties: { email: { type: "string" } } },
        "MyApp/User.login.output": { type: "object", properties: { token: { type: "string" } } },
        "Mailer.send.input": { type: "object", properties: { to: { type: "string" } } },
        "Mailer.send.output": { type: "object", properties: { messageId: { type: "string" } } }
      }
    };

    const result = generateOperations(mod);

    // Model CRUD
    assert.notStrictEqual(result.operations["User.Get"], undefined);

    // Model custom action (global)
    assert.notStrictEqual(result.operations["User.Login"], undefined);
    assert.strictEqual(result.operations["User.Login"].parameters, undefined, "Global action should not have uuid");

    // Bean operation
    assert.notStrictEqual(result.operations["Mailer.Send"], undefined);
  }

  @test
  async serviceSchemaNotMatchingModels() {
    // Ensure model schemas like "MyApp/Task.archive.input" are NOT treated as service operations
    const mod: WebdaModule = {
      beans: {},
      deployers: {},
      moddas: {},
      models: {
        "MyApp/Task": {
          Identifier: "MyApp/Task",
          Import: "lib/task:Task",
          Plural: "Tasks",
          Relations: {},
          Ancestors: [],
          Subclasses: [],
          PrimaryKey: ["uuid"],
          Events: [],
          Reflection: {},
          Schemas: {},
          Actions: {
            archive: {}
          }
        }
      },
      schemas: {
        "MyApp/Task.archive.input": { type: "object", properties: {} },
        "MyApp/Task.archive.output": { type: "object", properties: {} }
      }
    };

    const result = generateOperations(mod);

    // Model schemas contain "/" so they should NOT match the service pattern
    // Only the model action operation should exist
    assert.notStrictEqual(result.operations["Task.Archive"], undefined);
    // No spurious service operations
    const opKeys = Object.keys(result.operations);
    assert.strictEqual(opKeys.length, 1, "Should only have the model action operation");
  }
}
