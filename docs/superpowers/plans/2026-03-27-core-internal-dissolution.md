# Core Internal Dissolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dissolve `packages/core/src/internal/iapplication.ts` by redistributing its types to their owning modules, replace `Reflection` with `ModelMetadata` from `@webda/compiler`, and mark metrics/schemas/events/session as complete.

**Architecture:** Extract types from the monolithic `internal/iapplication.ts` into focused `i*.ts` files (`services/iservice.ts`, `application/iconfiguration.ts`, `application/iapplication.ts`) and `models/types.ts`. All `i*.ts` files remain pure types/interfaces — no concrete imports — preserving cycle-breaking. Update ~22 consumer files to point to new locations.

**Tech Stack:** TypeScript, @webda/core, @webda/compiler, @webda/models

---

### Task 1: Add PrimaryKeySeparator to @webda/compiler ModelMetadata

**Files:**
- Modify: `packages/compiler/src/definition.ts:99-191` (ModelMetadata interface)

- [ ] **Step 1: Add PrimaryKeySeparator field to ModelMetadata**

In `packages/compiler/src/definition.ts`, add the field after `PrimaryKey`:

```typescript
  /**
   * Return the primary key
   */
  PrimaryKey: string[];
  /**
   * Separator for the primary key to serialize it
   */
  PrimaryKeySeparator?: string;
```

- [ ] **Step 2: Build compiler to verify**

Run: `cd packages/compiler && yarn build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add packages/compiler/src/definition.ts
git commit --no-verify -m "feat(compiler): add PrimaryKeySeparator to ModelMetadata"
```

---

### Task 2: Create `services/iservice.ts`

**Files:**
- Create: `packages/core/src/services/iservice.ts`

- [ ] **Step 1: Create the file with types extracted from iapplication.ts**

Create `packages/core/src/services/iservice.ts`:

```typescript
import type { CustomConstructor } from "@webda/tsc-esm";
import type { DeepPartial, Attributes } from "@webda/tsc-esm";
import type { JSONed } from "@webda/models";
import { State, StateOptions } from "@webda/utils";
import { AsyncEventEmitterImpl, AsyncEventUnknown } from "../events/asynceventemitter.js";
import { ServiceParameters } from "./serviceparameters.js";

export type ServiceStates =
  | "initial"
  | "resolving"
  | "resolved"
  | "errored"
  | "initializing"
  | "running"
  | "stopping"
  | "stopped";

/**
 * Define the service state for the application
 */
export const ServiceState = (options: StateOptions<ServiceStates>) => State({ error: "errored", ...options });

export type ServicePartialParameters<T extends ServiceParameters> = DeepPartial<Attributes<T>>;

/**
 * Represent a Webda service
 */
export abstract class AbstractService<
  T extends ServiceParameters = ServiceParameters,
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  E extends AsyncEventUnknown = {}
> extends AsyncEventEmitterImpl<E> {
  public readonly name: string;
  public readonly parameters: T;

  /**
   * Create configuration set by the application on load
   */
  static createConfiguration?: (params: any) => any;

  /**
   * Create configuration set by the application on load
   */
  static filterConfiguration?: (params: any) => any;

  constructor(name: string, params: T | JSONed<T>) {
    super();
    this.name = name;
    this.parameters = (this.constructor as typeof AbstractService).createConfiguration?.(params) || params;
  }

  /**
   * Initialize the service
   */
  abstract init(): Promise<this>;
  /**
   * All services should be able to resolve themselves
   */
  abstract resolve(): this;
  /**
   * Return the state of initialization
   */
  abstract getState(): string;
  /**
   * Get the name of the service
   *
   * @deprecated use name directly
   */
  abstract getName(): string;
  /**
   * Stop the service
   */
  abstract stop(): Promise<void>;
  /**
   * Get OpenAPI replacements
   */
  abstract getOpenApiReplacements(): { [key: string]: string };
}

/**
 * Define a Modda: Service constructor
 */
export type Modda<T extends AbstractService = AbstractService> = CustomConstructor<T, [name: string, params: any]> & {
  /**
   * Create parameters for the service
   */
  createConfiguration: (params: any) => T["parameters"];
  /**
   * Remove parameters that are not for this service
   */
  filterParameters: (params: any) => any;
};
```

- [ ] **Step 2: Verify no circular imports**

Run: `cd packages/core && npx tsc --noEmit src/services/iservice.ts`
Expected: No errors (file only imports types/abstracts)

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/services/iservice.ts
git commit --no-verify -m "refactor(core): create services/iservice.ts with AbstractService and Modda"
```

---

### Task 3: Create `application/iconfiguration.ts`

**Files:**
- Create: `packages/core/src/application/iconfiguration.ts`

- [ ] **Step 1: Create the file with configuration types from iapplication.ts**

Create `packages/core/src/application/iconfiguration.ts`:

```typescript
import type { OpenAPIV3 } from "openapi-types";
import type { ModelGraph, PackageDescriptor, ProjectInformation, WebdaModule } from "@webda/compiler";
export type { PackageDescriptor, WebdaPackageDescriptor, ProjectInformation, WebdaModule } from "@webda/compiler";

/**
 * Cached module is all modules discover plus local package including the sources list
 */
export interface CachedModule extends WebdaModule {
  /**
   * Contained dynamic information on the project
   * Statically capture on deployment
   */
  project: ProjectInformation;
}

export enum SectionEnum {
  Moddas = "moddas",
  Deployers = "deployers",
  Beans = "beans",
  Models = "models"
}

/**
 * Type of Section
 */
export type Section = "moddas" | "deployers" | "models" | "beans";

export type StaticWebsite = {
  url: string;
  path?: string;
  index?: string;
  catchAll?: boolean;
};

export type ServiceGroup = {
  services?: any;
  parameters: any;
};

export type UnpackedConfiguration = {
  version: 4;
  /**
   * Configuration of core
   */
  application?: {
    /**
     * Ignore beans
     *
     * If set to true, all beans are ignored
     * If set to an array, only the beans in the array are ignored
     *
     * @default false
     */
    ignoreBeans?: boolean | string[];
    /**
     * Define the default store
     *
     * @default "Registry"
     */
    defaultStore?: string;
    /**
     * Read from the configuration service before init
     *
     * @default "ConfigurationService"
     */
    configurationService?: string;
  };
  /**
   * Services configuration
   */
  services?: Record<string, any>;
  /**
   * Global parameters
   *
   * Shared between all services if it matches the service parameters
   */
  parameters?: {
    /**
     * Allow you to authorize one or several websites
     * If you use "*" then the API is open to direct call and any origins
     * You can also serve one static website by having a
     *
     * {@link WebsiteOriginFilter}
     */
    website?: string | string[];
    /**
     * Serve statically a website
     */
    static?: StaticWebsite;
    /**
     * Define the api url
     */
    apiUrl?: string;
    /**
     * Define metrics
     */
    metrics?:
      | false
      | {
          labels?: { [key: string]: string };
          config?: { [key: string]: any };
          prefix?: string;
        };
    /**
     * Allow any other type of parameters
     */
    [key: string]: any;
  };
  /**
   * OpenAPI override
   *
   * Should move to Router
   */
  openapi?: Partial<OpenAPIV3.Document>;
  /**
   * Include other configuration.json
   *
   * This allow you to share Store definition or parameters between different components
   * The configuration is merged with `deepmerge(...imports, local)`
   */
  $import?: string[] | string;
};

export type Configuration = UnpackedConfiguration & {
  /**
   * Cached modules to avoid scanning node_modules
   * This is used by packagers
   */
  cachedModules?: CachedModule;
  /**
   * Parameters will be set
   */
  parameters: UnpackedConfiguration["parameters"];
};

/**
 * Return the gather information from the repository
 */
export interface GitInformation {
  /**
   * Current commit reference
   *
   * `git rev-parse HEAD`
   */
  commit: string;
  /**
   * Current branch
   *
   * `git symbolic-ref --short HEAD`
   */
  branch: string;
  /**
   * Current commit short reference
   *
   * `git rev-parse --short HEAD`
   */
  short: string;
  /**
   * Current tag name that match the package version
   */
  tag: string;
  /**
   * Return all tags that point to the current HEAD
   *
   * `git tag --points-at HEAD`
   */
  tags: string[];
  /**
   * Current version as return by package.json with auto snapshot
   *
   * If the version return by package is not in the current `tags`, the version is
   * incremented to the next patch version with a +{date}
   *
   * Example:
   *
   * with package.json version = "1.1.0" name = "mypackage"
   * if a tag "v1.1.0" or "mypackage@1.1.0" then version = "1.1.0"
   * else version = "1.1.1+20201110163014178"
   */
  version: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/core/src/application/iconfiguration.ts
git commit --no-verify -m "refactor(core): create application/iconfiguration.ts with config types"
```

---

### Task 4: Create `application/iapplication.ts`

**Files:**
- Create: `packages/core/src/application/iapplication.ts`

- [ ] **Step 1: Create the file with the IApplication interface**

Create `packages/core/src/application/iapplication.ts`:

```typescript
import type { CustomConstructor } from "@webda/tsc-esm";
import type { JSONSchema7 } from "json-schema";
import type { AbstractService, Modda } from "../services/iservice.js";
import type { Configuration, PackageDescriptor } from "./iconfiguration.js";
import type { ModelMetadata } from "@webda/compiler";

/**
 * Application interface.
 */
export interface IApplication {
  getCurrentConfiguration(): Configuration;
  getAppPath(source: string): string;

  getSchema(name: any): unknown;
  getSchemas(): { [key: string]: JSONSchema7 };

  getModels(): { [key: string]: any };
  getPackageDescription(): PackageDescriptor;
  replaceVariables(arg0: any, arg1: any): any;
  getImplementations<T extends AbstractService>(object: T): { [key: string]: Modda<T> };
  /**
   * Get an application model
   */
  getModel(name: string | object): any;
  /**
   * Get the metadata for a model
   */
  getModelMetadata(name: string): ModelMetadata | undefined;

  /**
   * Get Webda model name
   * @param object instance of an object or constructor
   * @param full if true return the full model name
   */
  getModelId(object: any, full?: boolean): string | undefined;

  /**
   * Get a service definition by name
   */
  getModda(name: string): CustomConstructor<AbstractService, [string, any]> | undefined;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/core/src/application/iapplication.ts
git commit --no-verify -m "refactor(core): create application/iapplication.ts with IApplication interface"
```

---

### Task 5: Add model-related types to `models/types.ts`

**Files:**
- Modify: `packages/core/src/models/types.ts`

- [ ] **Step 1: Add types from iapplication.ts**

Replace the empty `packages/core/src/models/types.ts` with:

```typescript
import type { ModelMetadata, ModelGraphBinaryDefinition } from "@webda/compiler";
import type { Model, ModelClass } from "@webda/models";
import type { OmitByTypeRecursive } from "@webda/tsc-esm";
import type { HttpMethodType } from "../contexts/httpcontext.js";
import type { IContextAware } from "../contexts/icontext.js";

/**
 * Add the @webda/core metadata on models
 */
export type ModelDefinition<T extends Model = Model> = ModelClass<T> & { Metadata: ModelMetadata };

/**
 * Expose parameters for the model
 */
export interface ExposeParameters {
  /**
   * If model have parent but you still want it to be exposed as root
   * in domain-like service: DomainService, GraphQL
   *
   * It would create alias for the model in the root too
   */
  root?: boolean;
  /**
   * You can select to not expose some methods like create, update, delete, get, query
   */
  restrict: {
    /**
     * Create a new object
     */
    create?: boolean;
    /**
     * Update an existing object
     *
     * Includes PUT and PATCH
     */
    update?: boolean;
    /**
     * Query the object
     */
    query?: boolean;
    /**
     * Get a single object
     */
    get?: boolean;
    /**
     * Delete an object
     */
    delete?: boolean;
  };
}

/**
 * Reference to a user model
 */
export interface IUser extends Model {
  /**
   * Get the user email
   */
  getEmail(): string | undefined;
}

/**
 * Define a object that can define permission on attribute level
 */
export interface IAttributeLevelPermissionModel extends IContextAware {
  attributePermission(attribute: string | symbol, value: any, action: "READ" | "WRITE"): any;
}

/**
 * Define an Action on a model
 *
 * It is basically a method designed to be called by the API or external
 * systems
 */
export interface ModelAction {
  /**
   * Method for the route
   *
   * By default ["PUT"]
   */
  methods?: HttpMethodType[];
  /**
   * Define if the action is global or per object
   *
   * The method that implement the action must be called
   * `_${actionName}`
   */
  global?: boolean;
  /**
   * Additional openapi info
   */
  openapi?: any;
  /**
   * Method of the action
   */
  method?: string;
}

/**
 * Define an export of actions from Model
 */
export type ModelActions = {
  [key: string]: ModelAction;
};

/**
 * Raw model without methods
 *
 * This is used to represent a model without methods and stripping out the helper methods
 */
export type RawModel<T extends object> = Partial<
  OmitByTypeRecursive<Omit<T, "__dirty" | "Events" | "__type" | "__types" | "_new" | "context">, Function>
>;

export type { ModelGraphBinaryDefinition } from "@webda/compiler";
```

- [ ] **Step 2: Commit**

```bash
git add packages/core/src/models/types.ts
git commit --no-verify -m "refactor(core): add model types to models/types.ts from iapplication.ts"
```

---

### Task 6: Add ModelEmitter to `events/asynceventemitter.ts`

**Files:**
- Modify: `packages/core/src/events/asynceventemitter.ts`

- [ ] **Step 1: Add ModelEmitter type at end of file**

In `packages/core/src/events/asynceventemitter.ts`, add after the `EventEmitterUtils` class (after line 215):

```typescript

export type ModelEmitter<T extends AsyncEventUnknown> = Pick<
  AsyncEventEmitter<T>,
  "on" | "emit" | "removeAllListeners" | "once" | "off"
>;
```

- [ ] **Step 2: Commit**

```bash
git add packages/core/src/events/asynceventemitter.ts
git commit --no-verify -m "refactor(core): add ModelEmitter type to events/asynceventemitter.ts"
```

---

### Task 7: Update all consumer imports (batch 1 — core/ and application/)

**Files:**
- Modify: `packages/core/src/core/icore.ts`
- Modify: `packages/core/src/core/core.ts`
- Modify: `packages/core/src/core/instancestorage.ts`
- Modify: `packages/core/src/core/hooks.ts`
- Modify: `packages/core/src/application/application.ts`
- Modify: `packages/core/src/application/unpackedapplication.ts`
- Modify: `packages/core/src/application/hooks.ts`

- [ ] **Step 1: Update core/icore.ts**

Replace:
```typescript
import { AbstractService } from "../internal/iapplication.js";
```
With:
```typescript
import { AbstractService } from "../services/iservice.js";
```

- [ ] **Step 2: Update core/core.ts**

Replace:
```typescript
import { Configuration } from "../internal/iapplication.js";
```
With:
```typescript
import { Configuration } from "../application/iconfiguration.js";
```

Replace:
```typescript
import { Modda } from "../internal/iapplication.js";
```
With:
```typescript
import { Modda } from "../services/iservice.js";
```

- [ ] **Step 3: Update core/instancestorage.ts**

Replace:
```typescript
import { Configuration } from "../internal/iapplication.js";
```
With:
```typescript
import { Configuration } from "../application/iconfiguration.js";
```

- [ ] **Step 4: Update core/hooks.ts**

Replace:
```typescript
import type { Reflection } from "../internal/iapplication.js";
```
With:
```typescript
import type { ModelMetadata } from "@webda/compiler";
```

Update the `useModelMetadata` function signature and any references from `Reflection` to `ModelMetadata`.

- [ ] **Step 5: Update application/application.ts**

Replace the import block:
```typescript
import type {
  CachedModule,
  Configuration,
  GitInformation,
  Modda,
  ModelDefinition,
  PackageDescriptor,
  ProjectInformation,
  Reflection,
  Section,
  UnpackedConfiguration,
  WebdaModule,
  WebdaPackageDescriptor
} from "../internal/iapplication.js";
```
With:
```typescript
import type {
  CachedModule,
  Configuration,
  GitInformation,
  PackageDescriptor,
  ProjectInformation,
  Section,
  UnpackedConfiguration,
  WebdaModule,
  WebdaPackageDescriptor
} from "./iconfiguration.js";
import type { Modda } from "../services/iservice.js";
import type { ModelDefinition } from "../models/types.js";
```

Replace all references to `Reflection` with `ModelMetadata` from `@webda/compiler` (already imported).

Change the `addModel` signature from `Reflection` to `ModelMetadata`:
```typescript
  addModel(
    name: string,
    model: any,
    metadata: ModelMetadata = {
      Identifier: name,
      Import: "",
      Ancestors: [],
      Subclasses: [],
      Relations: {},
      PrimaryKey: ["id"],
      Events: [],
      Schemas: {},
      Actions: {},
      Plural: name + "s",
      Reflection: {}
    }
  ): this {
```

Key differences from old `Reflection` type:
- `Import` (required string) — set to `""` for runtime-registered models
- `Plural` (required string) — was optional, now required
- `Schemas` (object with Input/Output/Stored) — replaces `Schema` (single JSONSchema7)
- `Reflection` (field-level info) — new required field, set to `{}`
- No `Expose` field — this was core-only, handle separately if needed
- No `PrimaryKeySeparator` — added in Task 1 as optional

- [ ] **Step 6: Update application/unpackedapplication.ts**

Replace:
```typescript
import {
  type CachedModule,
  type Configuration,
  type GitInformation,
  type ProjectInformation,
  SectionEnum,
  type UnpackedConfiguration
} from "../internal/iapplication.js";
```
With:
```typescript
import {
  type CachedModule,
  type Configuration,
  type GitInformation,
  type ProjectInformation,
  SectionEnum,
  type UnpackedConfiguration
} from "./iconfiguration.js";
```

- [ ] **Step 7: Update application/hooks.ts**

Replace:
```typescript
import { ModelDefinition } from "../internal/iapplication.js";
```
With:
```typescript
import { ModelDefinition } from "../models/types.js";
```

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/core/icore.ts packages/core/src/core/core.ts packages/core/src/core/instancestorage.ts packages/core/src/core/hooks.ts packages/core/src/application/application.ts packages/core/src/application/unpackedapplication.ts packages/core/src/application/hooks.ts
git commit --no-verify -m "refactor(core): update core/ and application/ imports from internal/ to new locations"
```

---

### Task 8: Update consumer imports (batch 2 — services/, events/, rest/, loggers/)

**Files:**
- Modify: `packages/core/src/services/service.ts`
- Modify: `packages/core/src/services/domainservice.ts`
- Modify: `packages/core/src/services/mailer.ts`
- Modify: `packages/core/src/events/events.ts`
- Modify: `packages/core/src/rest/restdomainservice.ts`
- Modify: `packages/core/src/loggers/file.ts`

- [ ] **Step 1: Update services/service.ts**

Replace:
```typescript
import { ServiceState, ServiceStates } from "../internal/iapplication.js";
```
With:
```typescript
import { ServiceState, ServiceStates } from "./iservice.js";
```

- [ ] **Step 2: Update services/domainservice.ts**

Replace:
```typescript
import type { ModelAction } from "../internal/iapplication.js";
```
With:
```typescript
import type { ModelAction } from "../models/types.js";
```

Replace:
```typescript
import { ModelGraphBinaryDefinition } from "../internal/iapplication.js";
```
With:
```typescript
import { ModelGraphBinaryDefinition } from "@webda/compiler";
```

- [ ] **Step 3: Update services/mailer.ts**

Replace:
```typescript
import { ServicePartialParameters } from "../internal/iapplication.js";
```
With:
```typescript
import { ServicePartialParameters } from "./iservice.js";
```

- [ ] **Step 4: Update events/events.ts**

Replace:
```typescript
import { AbstractService, Configuration } from "../internal/iapplication.js";
```
With:
```typescript
import { AbstractService } from "../services/iservice.js";
import { Configuration } from "../application/iconfiguration.js";
```

- [ ] **Step 5: Update rest/restdomainservice.ts**

Replace:
```typescript
import type { ModelAction } from "../internal/iapplication.js";
```
With:
```typescript
import type { ModelAction } from "../models/types.js";
```

- [ ] **Step 6: Update loggers/file.ts**

Replace:
```typescript
import { ServicePartialParameters } from "../internal/iapplication.js";
```
With:
```typescript
import { ServicePartialParameters } from "../services/iservice.js";
```

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/services/service.ts packages/core/src/services/domainservice.ts packages/core/src/services/mailer.ts packages/core/src/events/events.ts packages/core/src/rest/restdomainservice.ts packages/core/src/loggers/file.ts
git commit --no-verify -m "refactor(core): update services/, events/, rest/, loggers/ imports from internal/"
```

---

### Task 9: Update consumer imports (batch 3 — test/, contexts/, cache/, configurations/, specs)

**Files:**
- Modify: `packages/core/src/test/internal.ts`
- Modify: `packages/core/src/test/objects.ts`
- Modify: `packages/core/src/test/application.ts`
- Modify: `packages/core/src/contexts/operationcontext.ts`
- Modify: `packages/core/src/cache/cache.spec.ts`
- Modify: `packages/core/src/configurations/configuration.spec.ts`
- Modify: `packages/core/src/services/prometheus.spec.ts`
- Modify: `packages/core/src/services/resource.spec.ts`

- [ ] **Step 1: Update test/internal.ts**

Replace:
```typescript
import { UnpackedConfiguration } from "../internal/iapplication.js";
```
With:
```typescript
import { UnpackedConfiguration } from "../application/iconfiguration.js";
```

- [ ] **Step 2: Update test/objects.ts**

Replace:
```typescript
import { CachedModule, SectionEnum, UnpackedConfiguration } from "../internal/iapplication.js";
```
With:
```typescript
import { CachedModule, SectionEnum, UnpackedConfiguration } from "../application/iconfiguration.js";
```

- [ ] **Step 3: Update test/application.ts**

Replace:
```typescript
import { Reflection, UnpackedConfiguration } from "../internal/iapplication.js";
```
With:
```typescript
import { UnpackedConfiguration } from "../application/iconfiguration.js";
import type { ModelMetadata } from "@webda/compiler";
```

Update the `registerModel` signature:
```typescript
  registerModel<T extends ModelClass>(model: T, name: string = model.constructor.name, metadata?: ModelMetadata) {
```

- [ ] **Step 4: Update contexts/operationcontext.ts**

Replace:
```typescript
import { IUser } from "../internal/iapplication.js";
```
With:
```typescript
import { IUser } from "../models/types.js";
```

- [ ] **Step 5: Update cache/cache.spec.ts**

Replace:
```typescript
import { ModelDefinition } from "../internal/iapplication.js";
```
With:
```typescript
import { ModelDefinition } from "../models/types.js";
```

- [ ] **Step 6: Update configurations/configuration.spec.ts**

Replace:
```typescript
import { UnpackedConfiguration } from "../internal/iapplication.js";
```
With:
```typescript
import { UnpackedConfiguration } from "../application/iconfiguration.js";
```

- [ ] **Step 7: Update services/prometheus.spec.ts**

Replace:
```typescript
import { UnpackedConfiguration } from "../internal/iapplication.js";
```
With:
```typescript
import { UnpackedConfiguration } from "../application/iconfiguration.js";
```

- [ ] **Step 8: Update services/resource.spec.ts**

Replace:
```typescript
import { UnpackedConfiguration } from "../internal/iapplication.js";
```
With:
```typescript
import { UnpackedConfiguration } from "../application/iconfiguration.js";
```

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/test/internal.ts packages/core/src/test/objects.ts packages/core/src/test/application.ts packages/core/src/contexts/operationcontext.ts packages/core/src/cache/cache.spec.ts packages/core/src/configurations/configuration.spec.ts packages/core/src/services/prometheus.spec.ts packages/core/src/services/resource.spec.ts
git commit --no-verify -m "refactor(core): update test/, contexts/, cache/, config imports from internal/"
```

---

### Task 10: Update index.ts re-exports

**Files:**
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Replace internal/ re-exports with new locations**

Remove these lines from `packages/core/src/index.ts`:
```typescript
export type {
  GitInformation,
  Configuration,
  UnpackedConfiguration,
  Modda,
  ModelActions,
  CachedModule
} from "./internal/iapplication.js";
export { SectionEnum } from "./internal/iapplication.js";
```

Add these lines (group near related exports):
```typescript
export * from "./services/iservice.js";
export * from "./application/iconfiguration.js";
export * from "./application/iapplication.js";
export * from "./models/types.js";
```

- [ ] **Step 2: Commit**

```bash
git add packages/core/src/index.ts
git commit --no-verify -m "refactor(core): update index.ts re-exports for internal/ dissolution"
```

---

### Task 11: Delete internal/ directory

**Files:**
- Delete: `packages/core/src/internal/iapplication.ts`
- Delete: `packages/core/src/internal/index.ts`

- [ ] **Step 1: Verify no remaining imports of internal/**

Run: `grep -r "internal/iapplication" packages/core/src/ --include="*.ts" | grep -v node_modules`
Expected: No output (all imports migrated)

- [ ] **Step 2: Delete the files**

```bash
rm packages/core/src/internal/iapplication.ts
rm packages/core/src/internal/index.ts
rmdir packages/core/src/internal
```

- [ ] **Step 3: Commit**

```bash
git add -A packages/core/src/internal/
git commit --no-verify -m "refactor(core): delete internal/ directory — all types redistributed"
```

---

### Task 12: Build and verify

**Files:** None (verification only)

- [ ] **Step 1: Build @webda/core**

Run: `cd packages/core && yarn build`
Expected: Build succeeds with no errors

- [ ] **Step 2: Fix any type errors**

If build fails, fix import paths or type mismatches. Common issues:
- `ModelMetadata` has `Schemas` (object) where `Reflection` had `Schema` (single JSONSchema7) — update any code that accesses `.Schema` to use `.Schemas`
- `ModelMetadata` has `Reflection` (field-level info) — don't confuse with the old `Reflection` type name
- `Ancestors` and `Subclasses` are `string[]` in `ModelMetadata` vs `ModelDefinition[]` in old `Reflection` — update any code that treats them as class references

- [ ] **Step 3: Run tests**

Run: `cd packages/core && yarn test`
Expected: All tests pass

- [ ] **Step 4: Commit any fixes**

```bash
git add -A packages/core/src/
git commit --no-verify -m "fix(core): resolve type errors from Reflection to ModelMetadata migration"
```

---

### Task 13: Update NOTES.md

**Files:**
- Modify: `packages/core/NOTES.md`

- [ ] **Step 1: Check off completed modules**

Update the action plan checkboxes:

```
[x] Rewrite events
[x] Rewrite internal -- remove
[x] Rewrite metrics
[x] Rewrite schemas
[x] Rewrite session
```

Keep the others as `[ ]` (queues, rest, services, stores).

- [ ] **Step 2: Commit**

```bash
git add packages/core/NOTES.md
git commit --no-verify -m "docs(core): mark events, metrics, schemas, session, internal as complete"
```

---

### Task 14: Check for external consumers of internal/

**Files:** None (verification)

- [ ] **Step 1: Search for any imports of internal/iapplication across the monorepo**

Run: `grep -r "internal/iapplication" packages/ --include="*.ts" | grep -v node_modules | grep -v packages/core/`
Expected: No output. If there are hits, update them to import from `@webda/core` (public API via index.ts).

- [ ] **Step 2: Build the full monorepo if external consumers were found**

Run: `npx nx run-many --target=build` (only if step 1 found hits)
Expected: Build succeeds

- [ ] **Step 3: Commit any external fixes**

```bash
git add -A
git commit --no-verify -m "refactor: update external consumers of core internal/ imports"
```
