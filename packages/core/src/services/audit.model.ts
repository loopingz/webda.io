import { useCoreEvents } from "../events/events.js";
import { Service } from "../services/service.js";
import { ServiceParameters } from "./serviceparameters.js";
import { CoreModel } from "../models/coremodel.model.js";
import type { JSONSchema7 } from "json-schema";
import { escape, parse, QueryValidator } from "@webda/ql";
import * as WebdaError from "../errors/errors.js";
import { useApplication, useModel } from "../application/hooks.js";
import { useModelMetadata } from "../core/hooks.js";
import { useContext } from "../contexts/execution.js";
import type { OperationContext } from "../contexts/operationcontext.js";
import { hasSchema, registerSchema } from "../schemas/hooks.js";
import { parseSubjectKey, registerOperation, serializeSubjectKey, type OperationSubject } from "../core/operations.js";

/**
 * Represents a single audit log entry
 */
export class AuditEntry extends CoreModel {
  operationId: string;
  success: boolean;
  error?: string;
  userId?: string;
  /**
   * Identifier of the model the operation targeted, e.g. `WebdaSample/Post`
   */
  subjectModel?: string;
  /**
   * Canonical primary key of the targeted object (see `serializeSubjectKey`)
   */
  subjectKey?: string;
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
   *  - "write"   — everything except read operations (Get, List, Query)
   *  - "failure" — only failed operations
   * @default "all"
   */
  level?: "all" | "write" | "failure";

  /**
   * WebdaQL query evaluated against the session, required for global (`Audit.Query`)
   * and other-user (`Audit.Actor`) reads, and for the history of an object that no
   * longer exists. Unset means nobody.
   * @example "roles CONTAINS 'admin'"
   */
  readPermission?: string;

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

/**
 * Read-only operation suffixes excluded from "write" level auditing
 */
const READ_SUFFIXES = ["Get", "List", "Query"];

/**
 * The audit log's own read operations, treated as reads by the "write" level
 */
const AUDIT_READ_OPERATIONS = ["Audit.Subject", "Audit.Actor", "Audit.Query"];

/**
 * Page size of the audit read operations
 */
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

/**
 * Pagination properties shared by the read operation requests
 */
const PAGINATION_PROPERTIES: Record<string, JSONSchema7> = {
  limit: { type: "number" },
  continuationToken: { type: "string" }
};

/**
 * Request schemas of the read operations, registered in resolve()
 */
const AUDIT_SCHEMAS: Record<string, JSONSchema7> = {
  auditSubjectRequest: {
    type: "object",
    properties: { model: { type: "string" }, key: { type: ["string", "object"] }, ...PAGINATION_PROPERTIES },
    required: ["model", "key"]
  },
  auditActorRequest: {
    type: "object",
    properties: { userId: { type: "string" }, ...PAGINATION_PROPERTIES }
  },
  auditQueryRequest: {
    type: "object",
    properties: { q: { type: "string" }, ...PAGINATION_PROPERTIES }
  }
};

/**
 * @WebdaModda AuditService
 *
 * Service that listens to operation success/failure events and records audit entries.
 * Entries are stored in memory (accessible via getEntries()) and optionally
 * persisted to a store configured via the `store` parameter.
 *
 * It also exposes the read operations `Audit.Subject` (history of an object),
 * `Audit.Actor` (activity of a user) and `Audit.Query` (whole log), guarded by
 * the object's `canAct("audit")` or the `readPermission` parameter.
 */
export class AuditService extends Service<AuditServiceParameters> {
  /**
   * In-memory log of audit entries
   */
  protected entries: AuditEntry[] = [];

  /**
   * Parsed readPermission
   */
  protected readPermissionQuery?: QueryValidator;

  /**
   * Subscribe to operation success and failure events for audit logging
   * @returns this for chaining
   */
  resolve(): this {
    super.resolve();
    useCoreEvents("Webda.OperationFailure", async evt => {
      await this.addAuditEntry(evt.operationId, evt.context.getCurrentUserId(), evt.error, evt.subject);
    });
    useCoreEvents("Webda.OperationSuccess", async evt => {
      await this.addAuditEntry(evt.operationId, evt.context.getCurrentUserId(), undefined, evt.subject);
    });
    this.registerReadOperations();
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
      return !READ_SUFFIXES.includes(suffix) && !AUDIT_READ_OPERATIONS.includes(operationId);
    }
    return true;
  }

  /**
   * Create and store an audit entry for the given operation context and optional error
   * @param operationId - the operation identifier
   * @param userId - the user identifier (may be undefined for anonymous)
   * @param err - the error if the operation failed
   * @param subject - the object the operation targeted, if any
   */
  async addAuditEntry(operationId: string, userId?: string, err?: Error, subject?: OperationSubject): Promise<void> {
    const success = err === undefined;
    if (!this.shouldAudit(operationId, success)) {
      return;
    }
    const entry = new AuditEntry();
    entry.operationId = operationId;
    entry.success = success;
    entry.userId = userId;
    entry.timestamp = new Date();
    entry.subjectModel = subject?.model;
    entry.subjectKey = subject?.key;
    if (err) {
      entry.error = err.message;
    }
    this.entries.push(entry);
    await entry.save();
  }

  /**
   * Register the request schemas and the Audit.Subject / Audit.Actor / Audit.Query operations
   */
  protected registerReadOperations(): void {
    const appSchemas = useApplication().getSchemas();
    for (const [name, schema] of Object.entries(AUDIT_SCHEMAS)) {
      if (!hasSchema(name)) {
        registerSchema(name, schema);
      }
      appSchemas[name] ??= schema;
    }
    const service = this.getName();
    registerOperation("Audit.Subject", {
      service,
      method: "subjectEntries",
      input: "auditSubjectRequest",
      summary: "Audit entries of an object",
      tags: ["Audit"]
    });
    registerOperation("Audit.Actor", {
      service,
      method: "actorEntries",
      input: "auditActorRequest",
      summary: "Audit entries of a user",
      tags: ["Audit"]
    });
    registerOperation("Audit.Query", {
      service,
      method: "queryEntries",
      input: "auditQueryRequest",
      summary: "Query the audit log",
      tags: ["Audit"]
    });
  }

  /**
   * Check the readPermission query against the current session
   * @param context - the operation context
   * @returns true if the session matches readPermission
   */
  hasReadPermission(context: OperationContext): boolean {
    if (!this.parameters.readPermission) {
      return false;
    }
    this.readPermissionQuery ??= new QueryValidator(this.parameters.readPermission);
    return this.readPermissionQuery.eval(context.getSession() ?? {});
  }

  /**
   * Query the audit entries matching a filter, newest first
   * @param filter - WebdaQL filter (may be empty)
   * @param limit - page size, clamped to 1..200 (default 50)
   * @param continuationToken - token of the previous page
   * @returns the page of entries
   */
  protected async findEntries(
    filter: string,
    limit?: number,
    continuationToken?: string
  ): Promise<{ results: AuditEntry[]; continuationToken?: string }> {
    const pageSize = Math.min(Math.max(Math.floor(Number(limit)) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    let query = `${filter} ORDER BY timestamp DESC LIMIT ${pageSize}`;
    if (continuationToken) {
      query += escape([" OFFSET ", ""], [continuationToken]);
    }
    const res = await AuditEntry.query(query);
    return { results: res.results, continuationToken: res.continuationToken || undefined };
  }

  /**
   * Audit entries of one object (`Audit.Subject`)
   *
   * Allowed when `subject.canAct(context, "audit")` is true. When the object does not
   * exist (deleted or never created), `readPermission` is required, otherwise 404.
   * @param model - model identifier, e.g. `WebdaSample/Post`
   * @param key - primary key: scalar, object of key fields, or canonical JSON array
   * @param limit - page size
   * @param continuationToken - token of the previous page
   * @returns the page of entries
   */
  async subjectEntries(model: string, key: unknown, limit?: number, continuationToken?: string) {
    const context = useContext<OperationContext>();
    let modelClass: any;
    try {
      modelClass = useModel(model);
    } catch {
      throw new WebdaError.NotFound("Object not found");
    }
    const modelId = useApplication().getModelId(modelClass);
    if (!modelId) {
      throw new WebdaError.NotFound("Object not found");
    }
    const pkFields: string[] = useModelMetadata(modelClass)?.PrimaryKey ?? ["uuid"];
    const ref = parseSubjectKey(pkFields, key);
    if (ref === undefined) {
      throw new WebdaError.BadRequest("Invalid subject key");
    }
    let instance: any;
    try {
      instance = await modelClass.ref(ref).get();
    } catch {
      // Repositories throw when the object does not exist
    }
    if (instance && !instance.isDeleted?.()) {
      const allowed = typeof instance.canAct === "function" ? await instance.canAct(context, "audit") : false;
      if (allowed !== true) {
        throw new WebdaError.Forbidden(typeof allowed === "string" ? allowed : "Audit not allowed");
      }
    } else if (!this.hasReadPermission(context)) {
      throw new WebdaError.NotFound("Object not found");
    }
    return this.findEntries(
      escape(["subjectModel = ", " AND subjectKey = ", ""], [modelId, serializeSubjectKey(pkFields, ref)]),
      limit,
      continuationToken
    );
  }

  /**
   * Audit entries of one user (`Audit.Actor`)
   *
   * A logged-in user can read their own entries; anyone else needs `readPermission`.
   * @param userId - the user, defaults to the current user
   * @param limit - page size
   * @param continuationToken - token of the previous page
   * @returns the page of entries
   */
  async actorEntries(userId?: string, limit?: number, continuationToken?: string) {
    const context = useContext<OperationContext>();
    const current = context.getCurrentUserId();
    const target = userId || current;
    if (!target || (target !== current && !this.hasReadPermission(context))) {
      throw new WebdaError.Forbidden("Audit not allowed");
    }
    return this.findEntries(escape(["userId = ", ""], [target]), limit, continuationToken);
  }

  /**
   * Query the whole audit log (`Audit.Query`), requires `readPermission`
   *
   * Only the filter part of `q` is used; ordering and paging are fixed.
   * @param q - WebdaQL filter over the entry fields
   * @param limit - page size
   * @param continuationToken - token of the previous page
   * @returns the page of entries
   */
  async queryEntries(q?: string, limit?: number, continuationToken?: string) {
    const context = useContext<OperationContext>();
    if (!this.hasReadPermission(context)) {
      throw new WebdaError.Forbidden("Audit not allowed");
    }
    let filter = "";
    if (q) {
      try {
        filter = parse(q).filter.toString();
      } catch {
        throw new WebdaError.BadRequest("Query syntax error");
      }
    }
    return this.findEntries(filter, limit, continuationToken);
  }
}
