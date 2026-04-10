"use strict";

import { useCoreEvents } from "../events/events.js";
import { Service } from "../services/service.js";
import { ServiceParameters } from "./serviceparameters.js";
import { Inject } from "../services/service.js";
import { Store } from "../stores/store.js";

/**
 * Represents a single audit log entry
 */
export interface AuditEntry {
  operationId: string;
  success: boolean;
  error?: string;
  userId?: string;
  timestamp: Date;
}

/**
 * Parameters for the AuditService
 */
export class AuditServiceParameters extends ServiceParameters {
  /**
   * List of operations to include/exclude.
   * Supports wildcards and negation: ["*", "!User.Delete"]
   * @default ["*"]
   */
  operations?: string[];

  /**
   * Audit level filter:
   *  - "all"     — audit everything (default)
   *  - "write"   — only operations ending in Create, Update, Patch, Delete
   *  - "failure" — only failed operations
   * @default "all"
   */
  level?: "all" | "write" | "failure";

  /**
   * Service name of the store used for persistence (optional).
   * @default "auditStore"
   */
  store?: string;

  /**
   * Parsed exclude list
   * @SchemaIgnore
   */
  private excludedOperations: string[];

  /**
   * Load parameters and parse include/exclude lists
   * @param params - the service parameters
   * @returns this for chaining
   */
  load(params: any = {}): this {
    super.load(params);
    this.level ??= "all";
    this.operations ??= ["*"];
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
   * Check if an operation is included by this configuration
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

const WRITE_SUFFIXES = ["Create", "Update", "Patch", "Delete"];

/**
 * @WebdaModda AuditService
 *
 * Service that listens to operation success/failure events and records audit entries.
 * Entries are stored in memory (accessible via getEntries()) and optionally
 * persisted to a store configured via the `store` parameter.
 */
export class AuditService extends Service<AuditServiceParameters> {
  /**
   * Optional persistence store
   */
  @Inject("params:store", "auditStore", true)
  auditStore: Store;

  /**
   * In-memory log of audit entries
   */
  protected entries: AuditEntry[] = [];

  /**
   * Load the service parameters
   * @param params - the service parameters
   * @returns the loaded parameters
   */
  loadParameters(params: any): AuditServiceParameters {
    return new AuditServiceParameters().load(params);
  }

  /**
   * Static factory method for creating parameters
   * @param params - the service parameters
   * @returns the loaded parameters
   */
  static createConfiguration(params: any): AuditServiceParameters {
    return new AuditServiceParameters().load(params);
  }

  /**
   * Filter parameters
   * @param params - the service parameters
   * @returns the parameters
   */
  static filterParameters(params: any) {
    return params;
  }

  /**
   * Subscribe to operation success and failure events for audit logging
   * @returns this for chaining
   */
  resolve(): this {
    super.resolve();
    useCoreEvents("Webda.OperationFailure", async evt => {
      await this.addAuditEntry(evt.operationId, evt.context.getCurrentUserId(), evt.error);
    });
    useCoreEvents("Webda.OperationSuccess", async evt => {
      await this.addAuditEntry(evt.operationId, evt.context.getCurrentUserId());
    });
    return this;
  }

  /**
   * Get all in-memory audit entries
   * @returns the list of audit entries
   */
  getEntries(): AuditEntry[] {
    return this.entries;
  }

  /**
   * Determine whether the given operation should be audited
   * based on include/exclude filters and level configuration.
   * @param operationId - the operation identifier
   * @param success - whether the operation succeeded
   * @returns true if this operation should be audited
   */
  shouldAudit(operationId: string, success: boolean): boolean {
    // Check include/exclude filter
    if (!this.parameters.isIncluded(operationId)) {
      return false;
    }
    // Check level filter
    const level = this.parameters.level ?? "all";
    if (level === "failure") {
      return !success;
    }
    if (level === "write") {
      const suffix = operationId.split(".").pop() ?? "";
      return WRITE_SUFFIXES.includes(suffix);
    }
    return true;
  }

  /**
   * Create and store an audit entry for the given operation context and optional error
   * @param operationId - the operation identifier
   * @param userId - the user identifier (may be undefined for anonymous)
   * @param err - the error if the operation failed
   */
  async addAuditEntry(operationId: string, userId?: string, err?: Error): Promise<void> {
    const success = err === undefined;
    if (!this.shouldAudit(operationId, success)) {
      return;
    }
    const entry: AuditEntry = {
      operationId,
      success,
      userId,
      timestamp: new Date()
    };
    if (err) {
      entry.error = err.message;
    }
    this.entries.push(entry);
    if (this.auditStore) {
      await this.auditStore.save(entry as any);
    }
  }
}
