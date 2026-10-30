import * as assert from "assert";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateWebdaModule, openSession } from "@webda/content-mapper";
import type { TestApplication } from "@webda/core/lib/test/objects.js";
import { WorkflowTestBase } from "./fixture.js";
import { PaymentService } from "./app/src/payment.service.js";

/**
 * Root of the compiled test application
 */
export const COMPILED_APP = join(dirname(fileURLToPath(import.meta.url)), "app");

/**
 * Module of the test application, generated once
 */
let compiled: { flows: Record<string, any>; schemas: Record<string, any> } | undefined;

/**
 * Generate the module of the test application, as `webdac build` does
 * @returns its `flows` and `schemas` sections
 */
export function compiledModule(): { flows: Record<string, any>; schemas: Record<string, any> } {
  if (!compiled) {
    const session = openSession(join(COMPILED_APP, "tsconfig.json"), join(COMPILED_APP, "src"));
    try {
      const { module, errors } = generateWebdaModule(session.ctx, { appPath: COMPILED_APP });
      assert.deepStrictEqual(errors, []);
      compiled = { flows: (module as any).flows ?? {}, schemas: module.schemas };
    } finally {
      session.dispose();
    }
  }
  return structuredClone(compiled!);
}

/**
 * Compiled flows of the test application
 * @returns the `flows` section of its module
 */
export function compiledFlows(): Record<string, any> {
  return compiledModule().flows;
}

/**
 * A test application whose modules hold the compiled flows of `test/app`, with `PaymentService` configured under
 * the given names
 */
export class CompiledAppTestBase extends WorkflowTestBase {
  /**
   * Names the PaymentService is configured under
   */
  paymentServices: string[] = ["Billing"];

  /**
   * @override
   * @returns the configuration
   */
  getTestConfiguration(): any {
    return {
      version: 3,
      parameters: {},
      services: {
        WorkflowService: { type: "Webda/WorkflowService", worker: false },
        ...Object.fromEntries(this.paymentServices.map(name => [name, { type: "FlowApp/PaymentService" }]))
      }
    };
  }

  /**
   * Add the PaymentService and the compiled flows, as the merged modules would hold them
   * @param app - the test application
   */
  async tweakApp(app: TestApplication) {
    await super.tweakApp(app);
    app.addModda("FlowApp/PaymentService", PaymentService);
    // As the merged modules hold them
    const { flows, schemas } = compiledModule();
    app.getModules().flows = flows;
    Object.assign(app.getSchemas(), schemas);
  }
}
