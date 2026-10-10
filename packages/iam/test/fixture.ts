import { WebdaApplicationTest } from "@webda/core/lib/test/application.js";
import type { TestApplication } from "@webda/core/lib/test/objects.js";
import { IAMPolicy } from "../src/iampolicy.model.js";
import { IAMPolicyAttachment } from "../src/iampolicyattachment.model.js";
import { IAMService, IAMServiceParameters } from "../src/iam.service.js";

/**
 * Base test registering the IAM models and services from sources
 */
export class IAMTest extends WebdaApplicationTest {
  /**
   * Use the sources classes with the compiled metadata
   * @param app - the test application
   */
  async tweakApp(app: TestApplication) {
    await super.tweakApp(app);
    for (const [name, model] of <[string, any][]>[
      ["Webda/IAMPolicy", IAMPolicy],
      ["Webda/IAMPolicyAttachment", IAMPolicyAttachment]
    ]) {
      app.addModel(name, model, app.getModel(name).Metadata);
      model.registerSerializer(true, name);
    }
    (IAMService as any).createConfiguration = (params: any = {}) => new IAMServiceParameters().load(params);
    app.addModda("Webda/IAMService", IAMService);
  }
}
