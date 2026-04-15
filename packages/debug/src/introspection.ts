

import { useApplication, useCore, useRouter, listFullOperations, useModelMetadata } from "@webda/core";

/**
 * Information about a registered model.
 */
export interface ModelInfo {
  /** Fully-qualified model identifier, e.g. "MyApp/Task" */
  id: string;
  /** Plural name used in REST URLs, e.g. "Tasks" */
  plural: string;
  /** List of action names defined on the model */
  actions: string[];
  /** Relation graph (links, queries, maps, binaries) */
  relations: any;
  /** Full raw ModelMetadata object */
  metadata: any;
}

/**
 * Information about a running service.
 */
export interface ServiceInfo {
  /** Service registration name */
  name: string;
  /** Service type string (e.g. "Webda/Router") */
  type: string;
  /** Current lifecycle state (e.g. "running") */
  state: string;
  /** Capabilities advertised by the service */
  capabilities: Record<string, any>;
  /** Service configuration parameters */
  configuration: Record<string, any>;
}

/**
 * Information about a registered operation.
 */
export interface OperationInfo {
  /** Operation identifier, e.g. "Task.Create" */
  id: string;
  /** Input schema identifier. "void" means no input. */
  input: string;
  /** Output schema identifier. "void" means no output. */
  output: string;
  /** Parameters schema identifier, if any */
  parameters?: string;
  /** Additional fields from the operation definition */
  [key: string]: any;
}

/**
 * Information about a single route entry.
 */
export interface RouteInfoEntry {
  /** URL path pattern, e.g. "/tasks/{uuid}" */
  path: string;
  /** HTTP methods accepted by this route, e.g. ["GET","POST"] */
  methods: string[];
  /** Name of the executor service */
  executor: string;
}

/**
 * Returns introspection data for all models registered in the application.
 *
 * Each entry contains the model identifier, plural name, action names, relation
 * graph, and the full raw ModelMetadata object.
 *
 * @returns Array of {@link ModelInfo} objects, one per registered model.
 */
export function getModels(): ModelInfo[] {
  const app = useApplication();
  const core = useCore();
  const models = app.getModels();
  return Object.entries(models).map(([key, model]) => {
    const metadata = useModelMetadata(model);
    let storeName: string | undefined;
    let storeType: string | undefined;
    try {
      const store = core.getModelStore(model);
      if (store) {
        storeName = store.getName();
        storeType = store.constructor?.name;
      }
    } catch {
      // No store assigned
    }
    return {
      id: metadata?.Identifier || key,
      plural: metadata?.Plural || key,
      actions: Object.keys(metadata?.Actions || {}),
      relations: metadata?.Relations || {},
      store: storeName,
      storeType,
      schemas: metadata?.Schemas,
      metadata
    };
  });
}

/**
 * Returns introspection data for a single model by its identifier.
 *
 * @param id - Fully-qualified model identifier, e.g. "MyApp/Task".
 * @returns The matching {@link ModelInfo}, or `undefined` if not found.
 */
export function getModel(id: string): ModelInfo | undefined {
  return getModels().find(m => m.id === id);
}

/**
 * Returns introspection data for all services currently registered with Core.
 *
 * Null / undefined service slots are filtered out before mapping.
 *
 * @returns Array of {@link ServiceInfo} objects, one per registered service.
 */
export function getServices(): ServiceInfo[] {
  const core = useCore();
  const app = useApplication();
  const services = core.getServices();
  const config = core.getConfiguration?.() || {};
  return Object.entries(services)
    .filter(([, svc]) => svc != null)
    .map(([name, svc]) => {
      const type = (svc.parameters as any)?.type || "unknown";
      return {
        name,
        type,
        state: svc.getState(),
        capabilities: svc.getCapabilities(),
        configuration: config[name] || {},
        schema: app.getSchema?.(app.completeNamespace(type)) || undefined
      };
    });
}

/**
 * Returns introspection data for all operations registered in the instance storage.
 *
 * The `service` and `method` internal fields are omitted by {@link listOperations};
 * each entry gets a synthetic `id` field added.
 *
 * @returns Array of {@link OperationInfo} objects.
 */
export function getOperations(): OperationInfo[] {
  const ops = listFullOperations();
  const app = useApplication();
  const core = useCore();
  // Build a map of operation ID → full route URL by scanning the router's openapi metadata
  const operationRoutes: Record<string, { url: string; method: string }> = {};
  try {
    const router = useRouter();
    const routes = router.getRoutes();
    for (const [path, infos] of Object.entries(routes)) {
      for (const info of infos as any[]) {
        if (!info.openapi) continue;
        for (const methodDef of Object.values(info.openapi) as any[]) {
          if (methodDef?.operationId) {
            const method = info.methods?.[0]?.toLowerCase() || "get";
            operationRoutes[methodDef.operationId] = { url: path, method };
          }
        }
      }
    }
  } catch {
    // Router may not be available
  }
  return Object.entries(ops).map(([opId, def]) => {
    const entry: any = { ...def, id: opId };
    // Resolve input/output schema refs to actual JSON Schema objects
    for (const key of ["input", "output"] as const) {
      if (entry[key] && entry[key] !== "void") {
        entry[`${key}Schema`] = app.getSchema?.(entry[key]) || undefined;
      }
    }
    // Enrich rest with full URL from router
    const route = operationRoutes[opId];
    if (route) {
      entry.rest = { ...(typeof entry.rest === "object" ? entry.rest : {}), url: route.url, method: entry.rest?.method || route.method };
    }
    // Resolve implementor info
    try {
      let impl: any;
      if (def.service) {
        impl = core.getService(def.service);
        entry.implementor = { type: "service", name: def.service };
      } else if (def.model) {
        entry.implementor = { type: "model", name: def.model };
        impl = app.getModel(def.model);
      }
      if (impl && def.method && typeof impl[def.method] === "function") {
        entry.implementor.method = def.method;
        // Prefer the original unwrapped method if the @Operation decorator stored it
        const fn = impl[def.method];
        entry.implementor.code = (fn.__original || fn).toString();
      }
    } catch {
      // Service/model may not be resolvable
    }
    // Strip internal fields not useful for the UI
    delete entry.service;
    delete entry.model;
    delete entry.method;
    delete entry.context;
    delete entry.permissionQuery;
    return entry;
  });
}

/**
 * Returns introspection data for all routes registered with the Router service.
 *
 * A single path can have multiple route entries (one per executor / method set);
 * each is returned as a separate {@link RouteInfoEntry}.
 *
 * @returns Array of {@link RouteInfoEntry} objects.
 */
export function getRoutes(): RouteInfoEntry[] {
  const router = useRouter();
  const routes = router.getRoutes();
  const result: RouteInfoEntry[] = [];
  for (const [path, infos] of Object.entries(routes)) {
    for (const info of infos as any[]) {
      result.push({ path, methods: info.methods, executor: info.executor });
    }
  }
  return result;
}

/**
 * Returns the active application configuration object.
 *
 * This is the merged configuration (global + deployment overrides) that the
 * running application was started with.
 *
 * @returns Plain configuration record.
 */
export function getConfig(): Record<string, any> {
  return useApplication().getConfiguration();
}

/**
 * Returns project information including package.json data, git info, and deployment details.
 *
 * Adds the current working directory to the result.
 *
 * @returns Project information or a minimal fallback from package.json.
 */
export function getAppInfo(): Record<string, any> {
  const app = useApplication();
  const projectInfo = app.getProjectInfo?.();
  if (projectInfo) {
    return { ...projectInfo, workingDirectory: process.cwd() };
  }
  // Fallback for unpacked apps without full project info
  const pkg = app.getPackageDescription();
  return {
    package: pkg,
    workingDirectory: process.cwd()
  };
}
