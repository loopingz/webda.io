import { createMethodDecorator } from "@webda/tsc-esm";

/**
 * Options for the @Command decorator
 *
 * @example
 * ```typescript
 * @Command("serve", { description: "Start the HTTP server" })
 * async serve(port: number = 18080): Promise<void> { ... }
 * ```
 */
export interface CommandOptions {
  /**
   * Human-readable description of the command, displayed in `--help` output
   * and shell tab completion
   */
  description: string;
  /**
   * Capabilities required by this command.
   * Each string names a capability that must be provided by a configured service.
   * If not configured, the CLI auto-injects the default provider from the
   * capabilities map in webda.module.json.
   */
  requires?: string[];
  /**
   * Lifecycle phase at which this command runs.
   * - `"initialized"` (default): runs after `Core.init()` — full runtime including service.init() (DB, network).
   * - `"resolved"`: runs after `Core.resolve()` only — services are constructed and resolve()d but init() is skipped.
   *   Use for build-time codegen hooks that shouldn't touch the network.
   */
  phase?: "resolved" | "initialized";
}

/**
 * Declare a CLI command on a service method.
 *
 * The method parameters define the CLI arguments automatically:
 * - Parameter name becomes the `--flag` name (e.g., `port` → `--port`)
 * - TypeScript type annotation determines the flag type (`string`, `number`, `boolean`)
 * - Default value from the method signature becomes the flag default
 * - JSDoc `@alias` on parameter provides a single-character shorthand (e.g., `-p`)
 * - JSDoc `@description` on parameter provides help text for the flag
 * - JSDoc `@deprecated` on parameter marks the flag as deprecated
 *
 * Multiple services can declare the same command name — they all run in
 * dependency-graph order. Use `--service=ServiceName` to filter at invocation.
 *
 * Subcommands use space-separated names. The service owns its subtree:
 * `@Command("aws s3")` handles everything under `webda aws s3`.
 *
 * @param name - Command name, space-separated for subcommands (e.g., `"serve"`, `"aws s3"`)
 * @param options - Command options including description
 *
 * @example Simple command
 * ```typescript
 * class HttpServer extends Service {
 *   @Command("serve", { description: "Start the HTTP server" })
 *   async serve(
 *     /&ast;&ast; @alias b @description Bind address &ast;/
 *     bind: string = "127.0.0.1",
 *     /&ast;&ast; @alias p @description Port to listen on &ast;/
 *     port: number = 18080
 *   ): Promise<void> { ... }
 * }
 * // Usage: webda serve --port 3000 --bind 0.0.0.0
 * // Usage: webda serve -p 3000 -b 0.0.0.0
 * ```
 *
 * @example Subcommand
 * ```typescript
 * class S3Service extends Service {
 *   @Command("aws s3", { description: "Manage S3 buckets" })
 *   async s3(bucket?: string): Promise<void> { ... }
 * }
 * // Usage: webda aws s3 --bucket my-bucket
 * ```
 *
 * @example Composable command (multiple services)
 * ```typescript
 * class PostgresMigrator extends Service {
 *   @Command("migrate", { description: "Run PostgreSQL migrations" })
 *   async migrate(dryRun: boolean = false): Promise<void> { ... }
 * }
 * class MongoMigrator extends Service {
 *   @Command("migrate", { description: "Run MongoDB migrations" })
 *   async migrate(dryRun: boolean = false): Promise<void> { ... }
 * }
 * // webda migrate              → runs both
 * // webda migrate --service=PostgresMigrator  → runs only PostgreSQL
 * ```
 */
export const Command = createMethodDecorator(
  (
    value: any,
    context: ClassMethodDecoratorContext,
    name: string,
    options: CommandOptions = { description: "" }
  ) => {
    context.metadata["webda.commands"] ??= [];
    (context.metadata["webda.commands"] as any[]).push({
      name,
      description: options.description,
      method: context.name,
      requires: options.requires,
      phase: options.phase
    });
  }
);
