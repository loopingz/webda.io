
import { Service } from "./service.js";
import { ServiceParameters } from "./serviceparameters.js";
import { OperationDefinition } from "../core/icore.js";
import { useInstanceStorage } from "../core/instancestorage.js";

/**
 * Parameters for transports that selectively expose operations based on include/exclude patterns
 */
export class OperationsTransportParameters extends ServiceParameters {
  /**
   * List of operations to include/exclude
   * Supports wildcards and negation: ["*", "!User.Delete"]
   * @default ["*"]
   */
  operations?: string[];

  /**
   * Parsed exclude list
   * @SchemaIgnore
   */
  private excludedOperations: string[];

  /**
   * Load parameters and parse the include/exclude lists
   * @param params - the service parameters
   * @returns this for chaining
   */
  load(params: any = {}): this {
    super.load(params);
    this.operations ??= ["*"];
    // Only re-derive exclude list when the raw operations still contain negation entries
    if (this.operations.some(i => i.startsWith("!"))) {
      this.excludedOperations = this.operations.filter(i => i.startsWith("!")).map(i => i.substring(1));
      this.operations = this.operations.filter(i => !i.startsWith("!"));
      if (this.operations.length === 0) {
        this.operations = ["*"];
      }
    }
    this.excludedOperations ??= [];
    return this;
  }

  /**
   * Check if an operation matches a pattern (supports trailing wildcard)
   * @param operationId - the operation identifier
   * @param pattern - the pattern to match against
   * @returns true if the operation matches the pattern
   */
  private matchesPattern(operationId: string, pattern: string): boolean {
    if (pattern === "*") return true;
    if (pattern.endsWith(".*")) {
      return operationId.startsWith(pattern.slice(0, -1));
    }
    return operationId === pattern;
  }

  /**
   * Check if an operation is included by this transport
   * @param operationId - the operation identifier
   * @returns true if the operation is included
   */
  isIncluded(operationId: string): boolean {
    if (this.excludedOperations.some(p => this.matchesPattern(operationId, p))) {
      return false;
    }
    return this.operations.some(p => this.matchesPattern(operationId, p));
  }
}

/**
 * Abstract base class for transports that expose operations via a specific protocol (REST, GraphQL, gRPC, etc.).
 * Reads from the operation registry during init() and calls exposeOperation() for each visible operation.
 */
export abstract class OperationsTransport<
  T extends OperationsTransportParameters = OperationsTransportParameters
> extends Service<T> {
  /**
   * Get all registered operations, filtered by this transport's include/exclude config
   * @returns filtered map of operation id to definition
   */
  getOperations(): Record<string, OperationDefinition> {
    const all = useInstanceStorage().operations;
    const filtered: Record<string, OperationDefinition> = {};
    for (const [id, op] of Object.entries(all)) {
      if (this.parameters.isIncluded(id)) {
        filtered[id] = op;
      }
    }
    return filtered;
  }

  /**
   * Initialize the transport by exposing all non-hidden operations
   * @returns this for chaining
   */
  async init(): Promise<this> {
    await super.init();
    this.initTransport();
    return this;
  }

  /**
   * Walk the filtered operations and call exposeOperation for each non-hidden one
   */
  protected initTransport(): void {
    for (const [id, op] of Object.entries(this.getOperations())) {
      if (op.hidden) continue;
      this.exposeOperation(id, op);
    }
  }

  /**
   * Expose a single operation via the transport's protocol
   * @param operationId - the operation identifier
   * @param definition - the operation definition
   */
  abstract exposeOperation(operationId: string, definition: OperationDefinition): void;
}
