/**
 * Capability of the stores: their commands (`webda migrate`) only run on the configured instances
 */
export const STORE_CAPABILITY = "store";

/**
 * A store running the composable `migrate` command
 *
 * The CLI never adds an unconfigured store to run a command. Every store class declares `implements
 * MigratableStore` itself: the compiler reads the capability from the class own heritage clauses, and the
 * `@Command("migrate")` from its own methods.
 *
 * @WebdaCapability store
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface MigratableStore {}
