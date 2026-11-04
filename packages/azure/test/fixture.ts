import { Service, ServiceParameters, UnpackedConfiguration } from "@webda/core";
import { TestApplication, WebdaApplicationTest } from "@webda/core/lib/test/index.js";

/**
 * Register source classes with the same parameter factory installed by the module loader.
 * @param app - Test application container
 * @param name - Registered service name
 * @param modda - Service class registered through DI
 * @param parameters - Azure authentication or integration parameters
 */
export function addAzureModda(
  app: TestApplication,
  name: string,
  modda: typeof Service,
  parameters: typeof ServiceParameters
) {
  modda.createConfiguration = value => new parameters().load(value);
  app.addModda(name, modda);
}

/** Tests create all services through the application container. */
export class AzureTest extends WebdaApplicationTest {
  /**
   * Perform tweak app.
   * @override
   */
  async tweakApp(app: TestApplication): Promise<void> {
    await super.tweakApp(app);
    const model = app.getModel("WebdaTest/Task");
    app.addModel("WebdaTest/Task", model, { ...model.Metadata, PrimaryKey: ["uuid"] });
    model.registerSerializer(true, "WebdaTest/Task");
  }
  /**
   * Perform get test configuration.
   * @override
   */
  getTestConfiguration(): Partial<UnpackedConfiguration> {
    return { application: { ignoreBeans: true }, services: {} };
  }
}
