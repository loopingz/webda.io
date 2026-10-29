import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import {
  Application,
  Core,
  InstanceStorage,
  runWithInstanceStorage,
  useInstanceStorage,
  WebdaError
} from "@webda/core";
import { AzureFunctionServer } from "../services/functionserver.service.js";

export interface AzureFunctionApplication {
  server: AzureFunctionServer;
  instance: InstanceStorage;
}

/**
 * Load a packaged application through Webda's DI container in its own async storage.
 * @param path - Application folder or content path
 * @returns The boot azure function server result
 */
export async function bootAzureFunctionServer(path = process.cwd()): Promise<AzureFunctionApplication> {
  return runWithInstanceStorage({}, async () => {
    const application = new Application(path);
    useInstanceStorage().application = application;
    await application.load();
    const core = new Core(application);
    await core.init();
    const server = Object.values(core.getServices()).find(
      service => service instanceof AzureFunctionServer || service.constructor.name === "AzureFunctionServer"
    ) as AzureFunctionServer | undefined;
    if (!server)
      throw new WebdaError.CodeError(
        "AZURE_FUNCTION_SERVER",
        "No AzureFunctionServer is configured in the application"
      );
    return { server, instance: useInstanceStorage() };
  });
}

/**
 * Memoized boot with recovery after failures; each concurrent invocation enters its own request context.
 * @param boot - Application boot factory
 * @returns HTTP, event and cron invocation handlers
 */
export function createAzureHandlers(boot = bootAzureFunctionServer) {
  let booted: Promise<AzureFunctionApplication> | undefined;
  const invoke = async <T>(callback: (server: AzureFunctionServer) => Promise<T>): Promise<T> => {
    booted ??= boot().catch(error => {
      booted = undefined;
      throw error;
    });
    const { server, instance } = await booted;
    return runWithInstanceStorage(instance, () => callback(server));
  };
  return {
    http: (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> =>
      invoke(server => server.handleRequest(request, context)),
    event: (source: "servicebus" | "blob" | "timer", event: unknown, context: InvocationContext): Promise<void> =>
      invoke(server => server.handleEvent(source, event, context)),
    cron: (id: string): Promise<void> => invoke(server => server.handleCron(id))
  };
}

export type AzureTrigger =
  | { name: string; type: "servicebus"; queueName: string; connection: string }
  | { name: string; type: "blob"; path: string; connection: string }
  | { name: string; type: "timer"; schedule: string };

/**
 * Called only by the generated Functions bootstrap, never by the package's normal import.
 * @param crons - Exported cron definitions
 * @param triggers - Additional event binding declarations
 */
export function registerAzureFunctions(
  crons: { id: string; schedule: string }[] = [],
  triggers: AzureTrigger[] = []
): void {
  const handlers = createAzureHandlers();
  app.http("webda", {
    route: "{*path}",
    authLevel: "anonymous",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    handler: handlers.http
  });
  for (const cron of crons)
    app.timer(`cron-${cron.id}`, { schedule: cron.schedule, handler: () => handlers.cron(cron.id) });
  for (const trigger of triggers) {
    if (trigger.type === "servicebus")
      app.serviceBusQueue(trigger.name, {
        queueName: trigger.queueName,
        connection: trigger.connection,
        handler: (event, context) => handlers.event("servicebus", event, context)
      });
    else if (trigger.type === "blob")
      app.storageBlob(trigger.name, {
        path: trigger.path,
        connection: trigger.connection,
        handler: (event, context) => handlers.event("blob", event, context)
      });
    else
      app.timer(trigger.name, {
        schedule: trigger.schedule,
        handler: (event, context) => handlers.event("timer", event, context)
      });
  }
}
