import { Service } from "@webda/core";
import type { TestApplication } from "@webda/core/lib/test/objects.js";

/**
 * Minimal AuthProvider service: specs call `complete()` on its behalf
 */
export class StubProvider extends Service {
  readonly providerName: string = "";

  /**
   * @returns public info
   */
  getPublicInfo(): { name: string; type: "oauth"; startUrl: string } {
    return { name: this.providerName, type: "oauth", startUrl: `/auth/${this.providerName}` };
  }
}

/**
 * @param name - provider name
 * @returns a StubProvider class whose provider is `name`
 */
export function stubProvider(name: string): typeof StubProvider {
  return class extends StubProvider {
    readonly providerName = name;
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
