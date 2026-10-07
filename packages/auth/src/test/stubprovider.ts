import { Service } from "@webda/core";
import type { TestApplication } from "@webda/core/lib/test/objects.js";

/**
 * @param name - provider name
 * @returns a minimal AuthProvider service class named `name` (specs call complete() on its behalf)
 */
export function stubProvider(name: string) {
  return class StubProvider extends Service {
    readonly providerName = name;

    /**
     * @returns public info
     */
    getPublicInfo() {
      return { name, type: "oauth" as const, startUrl: `/auth/${name}` };
    }
  };
}

/**
 * Register stub providers in a test application: add `<name>: { type: "WebdaTest/Stub_<name>" }` to the services
 * @param app - test application
 * @param names - provider names
 */
export function addStubProviders(app: TestApplication, ...names: string[]): void {
  for (const name of names) {
    app.addModda(`WebdaTest/Stub_${name}`, stubProvider(name) as any);
  }
}

/**
 * @param names - provider names
 * @returns the services configuration of the stub providers
 */
export function stubProvidersConfig(...names: string[]): Record<string, { type: string }> {
  return Object.fromEntries(names.map(name => [`${name}Stub`, { type: `WebdaTest/Stub_${name}` }]));
}
