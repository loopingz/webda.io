import { WebdaApplicationTest } from "@webda/core/lib/test/application.js";
import type { TestApplication } from "@webda/core/lib/test/objects.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SdkGenerator } from "../src/sdkgenerator.service.js";

/** Root of the sample application */
export const SAMPLE_APP = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "sample-app");

/**
 * Boots `sample-app` (WebdaDemo) with the SdkGenerator configured
 */
export class SampleAppTest extends WebdaApplicationTest {
  /** Extra services added to the sample configuration */
  extraServices: Record<string, any> = {};

  /**
   * Get the sample application path
   * @returns the sample application path
   */
  getTestConfiguration(): any {
    return SAMPLE_APP;
  }

  /**
   * Perform tweak app
   * @param app - the test application
   */
  async tweakApp(app: TestApplication): Promise<void> {
    await super.tweakApp(app);
    app.addModda("Webda/SdkGenerator", SdkGenerator);
    const services = app.getCurrentConfiguration().services;
    services.SdkGenerator ??= { type: "Webda/SdkGenerator", outDir: ".webda/sdk-test" };
    Object.assign(services, this.extraServices);
  }

  /**
   * Get the generator
   * @returns the generator
   */
  get generator(): SdkGenerator {
    return this.webda.getService<SdkGenerator>("SdkGenerator");
  }
}
