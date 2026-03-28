# Design: @webda/core Small Module Rewrites + internal/ Dissolution

**Date**: 2026-03-27
**Branch**: fix/models
**Scope**: packages/core, packages/compiler (minor)

---

## Objective

Continue the @webda/core refactor by:
1. Completing the rewrite of 4 smaller modules (metrics, schemas, events, session)
2. Dissolving `src/internal/iapplication.ts` (551 lines) by redistributing its types into the modules that own them
3. Replacing `Reflection` with `ModelMetadata` from `@webda/compiler`

---

## Context

The `fix/models` branch has already rewritten 8 modules (cache, contexts, errors, loggers, models, test, utils, application/core partially). The remaining modules range from trivial (metrics: 76 lines) to large (services: 8,700+ lines). This spec covers the smaller ones plus the `internal/` dissolution, which unblocks cleaner imports across all remaining modules.

The `internal/iapplication.ts` file was created to break circular dependencies by placing shared interfaces in a neutral location. The dissolution preserves this property by keeping all target files as pure type/interface files (`i*.ts` convention).

---

## 1. @webda/compiler Change

Add `PrimaryKeySeparator` to `ModelMetadata` in `packages/compiler/src/definition.ts`:

```typescript
export interface ModelMetadata {
  // ... existing fields ...
  /**
   * Separator for the primary key to serialize it
   */
  PrimaryKeySeparator?: string;
}
```

This is the only change to `@webda/compiler`.

---

## 2. New Files in @webda/core

### 2.1 `src/services/iservice.ts`

Contains service-related types extracted from `iapplication.ts`:

- `ServiceStates` type (`"initial" | "resolving" | "resolved" | ...`)
- `ServiceState` const (state machine factory)
- `ServicePartialParameters<T>` type
- `AbstractService<T, E>` abstract class (extends `AsyncEventEmitterImpl`)
- `Modda<T>` type (service constructor with `createConfiguration`/`filterParameters`)

**Imports only from:** `@webda/tsc-esm`, `@webda/models`, `@webda/utils`, `../events/asynceventemitter.js`, `./serviceparameters.js`

### 2.2 `src/application/iconfiguration.ts`

Contains configuration types extracted from `iapplication.ts`:

- `StaticWebsite` type
- `ServiceGroup` type
- `UnpackedConfiguration` type
- `Configuration` type (extends `UnpackedConfiguration` with `cachedModules`)
- `GitInformation` interface
- `CachedModule` interface (extends `WebdaModule`)
- `SectionEnum` enum + `Section` type
- Re-exports from `@webda/compiler`: `PackageDescriptor`, `WebdaPackageDescriptor`, `ProjectInformation`, `WebdaModule`

**Imports only from:** `@webda/compiler`, `openapi-types`

### 2.3 `src/application/iapplication.ts`

Contains the application interface extracted from `iapplication.ts`:

- `IApplication` interface

**Imports from:** `./iconfiguration.js`, `../services/iservice.js`, `@webda/compiler`, `@webda/models`, `@webda/tsc-esm`

---

## 3. Modified Files in @webda/core

### 3.1 `src/models/types.ts`

Add model-related types from `iapplication.ts`:

- `ModelDefinition<T>` — updated: `ModelClass<T> & { Metadata: ModelMetadata }` (using `ModelMetadata` from `@webda/compiler` instead of `Reflection`)
- `ModelAction` interface (core-specific: `methods`, `global`, `openapi`, `method`)
- `ModelActions` type (`{ [key: string]: ModelAction }`)
- `ExposeParameters` interface (REST exposure config: `root`, `restrict`)
- `IAttributeLevelPermissionModel` interface
- `IUser` interface
- `RawModel<T>` type

**Note:** `ModelAction` in core differs from `ModelMetadata.Actions` in compiler. These are intentionally not aligned for now.

### 3.2 `src/events/asynceventemitter.ts`

Add `ModelEmitter<T>` type (currently in `iapplication.ts`):

```typescript
export type ModelEmitter<T extends AsyncEventUnknown> = Pick<
  AsyncEventEmitter<T>,
  "on" | "emit" | "removeAllListeners" | "once" | "off"
>;
```

### 3.3 `src/events/events.ts`

Update imports:
- `AbstractService` from `../services/iservice.js` (was `../internal/iapplication.js`)
- `Configuration` from `../application/iconfiguration.js` (was `../internal/iapplication.js`)

### 3.4 `src/index.ts`

Update re-exports:
- Remove: `export type { ... } from "./internal/iapplication.js"`
- Remove: `export { SectionEnum } from "./internal/iapplication.js"`
- Add: exports from `./services/iservice.js`, `./application/iconfiguration.js`, `./application/iapplication.js`
- Ensure `./models/types.js` exports the new types

### 3.5 ~22 files with `../internal/iapplication.js` imports

Each file's import updated to point to the correct new location:

| File | Types imported | New source |
|---|---|---|
| `services/service.ts` | `ServiceState`, `ServiceStates` | `./iservice.js` |
| `services/domainservice.ts` | `ModelAction`, `ModelGraphBinaryDefinition` | `../models/types.js`, `@webda/compiler` |
| `rest/restdomainservice.ts` | `ModelAction` | `../models/types.js` |
| `events/events.ts` | `AbstractService`, `Configuration` | `../services/iservice.js`, `../application/iconfiguration.js` |
| `core/core.ts` | `Configuration`, `Modda` | `../application/iconfiguration.js`, `../services/iservice.js` |
| `core/icore.ts` | `AbstractService` | `../services/iservice.js` |
| `core/instancestorage.ts` | `Configuration` | `../application/iconfiguration.js` |
| `core/hooks.ts` | `Reflection` → `ModelMetadata` | `@webda/compiler` |
| `application/application.ts` | Multiple types | Split across new files |
| `application/unpackedapplication.ts` | Multiple types | Split across new files |
| `application/hooks.ts` | `ModelDefinition` | `../models/types.js` |
| `contexts/operationcontext.ts` | `IUser` | `../models/types.js` |
| `loggers/file.ts` | `ServicePartialParameters` | `../services/iservice.js` |
| `services/mailer.ts` | `ServicePartialParameters` | `./iservice.js` |
| `test/internal.ts` | `UnpackedConfiguration` | `../application/iconfiguration.js` |
| `test/objects.ts` | `CachedModule`, `SectionEnum`, `UnpackedConfiguration` | `../application/iconfiguration.js` |
| `test/application.ts` | `Reflection` → `ModelMetadata`, `UnpackedConfiguration` | `@webda/compiler`, `../application/iconfiguration.js` |
| `cache/cache.spec.ts` | `ModelDefinition` | `../models/types.js` |
| `configurations/configuration.spec.ts` | `UnpackedConfiguration` | `../application/iconfiguration.js` |
| `services/prometheus.spec.ts` | `UnpackedConfiguration` | `../application/iconfiguration.js` |
| `services/resource.spec.ts` | `UnpackedConfiguration` | `../application/iconfiguration.js` |

---

## 4. Deleted

- `src/internal/iapplication.ts` — all contents redistributed
- `src/internal/index.ts` — module comment only, no longer needed
- `src/internal/` directory

Types deleted outright:
- `ModelsTree` — deprecated
- `SerializedReflection` — depended on `Reflection`
- `StoredConfiguration` — was just `type StoredConfiguration = Configuration`
- `ModelGraphBinaryDefinition` — duplicated from `@webda/compiler`
- `Values<T>` / `OmitNever<T>` — unused outside `internal/`, delete

---

## 5. Modules With No Structural Changes

### 5.1 Metrics (`src/metrics/`)
Already clean. Uses `useMetric()` hook, imports from `../core/instancestorage.js` and `prom-client`. No `internal/` dependency. **No changes needed.**

### 5.2 Schemas (`src/schemas/`)
Already clean. Has hooks pattern (`validateModelSchema`, `registerSchema`, `validateSchema`, `hasSchema`). Imports from `../application/hooks.js` and `@webda/models`. No `internal/` dependency. **No changes needed.**

### 5.3 Session (`src/session/`)
Mostly clean. `cookie.ts` uses `useCrypto()` hook. `session.ts` is standalone. `manager.ts` uses `@Inject` and extends `Service` — kept as-is since services module hasn't been rewritten yet. **Only import updates if any reference `internal/`** (currently none do).

---

## 6. Dependency Flow (Circular Import Prevention)

The `i*.ts` files are pure types/interfaces/abstract classes. They break cycles by not importing concrete implementations.

```
services/iservice.ts        ← imports: @webda/tsc-esm, @webda/models, @webda/utils,
                                        events/asynceventemitter.js, services/serviceparameters.js

application/iconfiguration.ts ← imports: @webda/compiler, openapi-types

application/iapplication.ts   ← imports: services/iservice.js, application/iconfiguration.js,
                                          @webda/compiler, @webda/models, @webda/tsc-esm

models/types.ts               ← imports: @webda/models, @webda/compiler,
                                          contexts/httpcontext.js (HttpMethodType),
                                          contexts/icontext.js (IContextAware)
```

**Rule:** `i*.ts` files must never import concrete classes or implementations. Only types, interfaces, abstract classes, and enums.

---

## 7. NOTES.md Updates

After completion, check off in `packages/core/NOTES.md`:
- [x] Rewrite events
- [x] Rewrite metrics
- [x] Rewrite schemas
- [x] Rewrite session (import updates only)
- [x] Rewrite internal — remove
