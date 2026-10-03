import { WebdaApplicationTest } from "@webda/core/lib/test/application.js";
import type { TestApplication } from "@webda/core/lib/test/objects.js";
import { AsyncAction, AsyncOperationAction, AsyncWebdaAction } from "../src/asyncaction.model.js";
import { AsyncJobService, AsyncJobServiceParameters } from "../src/services/asyncjobservice.service.js";
import { EventService, EventServiceParameters } from "../src/services/asyncevents.service.js";
import { LocalRunner, LocalRunnerParameters } from "../src/services/localrunner.service.js";
import { ServiceRunner, ServiceRunnerParameters } from "../src/services/servicerunner.service.js";

/**
 * Base test registering the async models and services from sources
 */
export class AsyncTest extends WebdaApplicationTest {
  /**
   * Use the sources classes with the compiled metadata
   * @param app - the test application
   */
  async tweakApp(app: TestApplication) {
    await super.tweakApp(app);
    for (const [name, model] of <[string, any][]>[
      ["Webda/AsyncAction", AsyncAction],
      ["Webda/AsyncWebdaAction", AsyncWebdaAction],
      ["Webda/AsyncOperationAction", AsyncOperationAction]
    ]) {
      app.addModel(name, model, app.getModel(name).Metadata);
      model.registerSerializer(true, name);
    }
    for (const [name, service, parameters] of <[string, any, any][]>[
      ["Webda/AsyncJobService", AsyncJobService, AsyncJobServiceParameters],
      ["Webda/AsyncEvents", EventService, EventServiceParameters],
      ["Webda/LocalRunner", LocalRunner, LocalRunnerParameters],
      ["Webda/ServiceRunner", ServiceRunner, ServiceRunnerParameters]
    ]) {
      service.createConfiguration = (params: any = {}) => new parameters().load(params);
      app.addModda(name, service);
    }
  }
}
