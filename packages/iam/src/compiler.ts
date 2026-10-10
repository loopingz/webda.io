import { analyzeCondition, PolicyCompileError } from "./conditions.js";

/**
 * One statement of a policy
 */
export interface PolicyStatement {
  /**
   * Optional statement identifier
   */
  sid?: string;
  /**
   * Allow or deny: a matching deny wins
   */
  effect: "allow" | "deny";
  /**
   * Glob patterns on operation ids: "Tasks.*", "*.Get", "*"
   */
  operations: string[];
  /**
   * Casbin expression over `r.ctx`; omitted means always
   */
  condition?: string;
}

/**
 * An IAM policy document
 */
export interface PolicyDocument {
  /**
   * Unique policy name
   */
  name: string;
  /**
   * Human description
   */
  description?: string;
  /**
   * Statements of the policy
   */
  statements: PolicyStatement[];
}

/**
 * Attachment of a policy to a principal
 */
export interface PolicyAttachment {
  /**
   * `user:<uuid>`, `group:<name>`, `authenticated` or `anonymous`
   */
  principal: string;
  /**
   * Policy name
   */
  policy: string;
}

/**
 * A Casbin `p` row: subject, operation pattern, effect, condition, probe flag
 */
export type PolicyRow = [sub: string, op: string, eft: "allow" | "deny", cond: string, probe: "input" | ""];

/**
 * A Casbin `g` row: principal, policy subject
 */
export type AttachmentRow = [principal: string, sub: string];

const PRINCIPAL = /^(user:.+|group:.+|authenticated|anonymous)$/;

/**
 * @param name - the policy name
 * @returns the Casbin subject of a policy
 */
export function policySubject(name: string): string {
  return `policy:${name}`;
}

/**
 * @param principal - the principal
 * @returns true for `user:<id>`, `group:<name>`, `authenticated` or `anonymous`
 */
export function isValidPrincipal(principal: string): boolean {
  return typeof principal === "string" && PRINCIPAL.test(principal);
}

/**
 * Validate a list of statements
 * @param statements - the statements to check
 * @returns the statements
 * @throws PolicyCompileError when invalid
 */
export function validateStatements(statements: unknown): PolicyStatement[] {
  if (!Array.isArray(statements)) {
    throw new PolicyCompileError("statements must be an array");
  }
  statements.forEach((statement: any, index) => {
    const where = `statement ${statement?.sid ?? index}`;
    if (statement?.effect !== "allow" && statement?.effect !== "deny") {
      throw new PolicyCompileError(`${where}: effect must be 'allow' or 'deny'`);
    }
    if (
      !Array.isArray(statement.operations) ||
      statement.operations.length === 0 ||
      statement.operations.some((op: unknown) => typeof op !== "string" || op === "")
    ) {
      throw new PolicyCompileError(`${where}: operations must be a non-empty list of patterns`);
    }
    if (statement.condition !== undefined) {
      if (typeof statement.condition !== "string") {
        throw new PolicyCompileError(`${where}: condition must be a string`);
      }
      try {
        analyzeCondition(statement.condition);
      } catch (err) {
        throw new PolicyCompileError(`${where}: ${err.message}`);
      }
    }
  });
  return statements as PolicyStatement[];
}

/**
 * Validate a policy document
 * @param doc - the document
 * @returns the document
 * @throws PolicyCompileError when invalid
 */
export function validatePolicyDocument(doc: unknown): PolicyDocument {
  const policy = doc as PolicyDocument;
  if (typeof policy?.name !== "string" || policy.name === "") {
    throw new PolicyCompileError("Policy name is required");
  }
  try {
    validateStatements(policy.statements);
  } catch (err) {
    throw new PolicyCompileError(`Policy ${policy.name}: ${err.message}`);
  }
  return policy;
}

/**
 * Compile policy documents into deduplicated Casbin `p` rows
 * @param docs - the documents
 * @returns the rows
 * @throws PolicyCompileError for an invalid document or a duplicate name
 */
export function compilePolicies(docs: PolicyDocument[]): PolicyRow[] {
  const names = new Set<string>();
  const rows = new Map<string, PolicyRow>();
  for (const doc of docs) {
    validatePolicyDocument(doc);
    if (names.has(doc.name)) {
      throw new PolicyCompileError(`Duplicate policy name ${doc.name}`);
    }
    names.add(doc.name);
    for (const statement of doc.statements) {
      const condition = statement.condition?.trim() || "true";
      const probe = statement.condition && analyzeCondition(statement.condition).readsInput ? "input" : "";
      for (const operation of statement.operations) {
        const row: PolicyRow = [policySubject(doc.name), operation, statement.effect, condition, probe];
        rows.set(JSON.stringify(row), row);
      }
    }
  }
  return [...rows.values()];
}

/**
 * @param config - principal to policy names, as in the IAMService parameters
 * @returns the attachments
 */
export function attachmentsFromConfig(config: Record<string, string[]>): PolicyAttachment[] {
  return Object.entries(config ?? {}).flatMap(([principal, policies]) =>
    (policies ?? []).map(policy => ({ principal, policy }))
  );
}

/**
 * Compile attachments into deduplicated Casbin `g` rows
 * @param attachments - the attachments
 * @param known - the names of existing policies
 * @returns the rows, and the attachments ignored (unknown policy or invalid principal)
 */
export function compileAttachments(
  attachments: PolicyAttachment[],
  known: Set<string>
): { rows: AttachmentRow[]; ignored: PolicyAttachment[] } {
  const rows = new Map<string, AttachmentRow>();
  const ignored: PolicyAttachment[] = [];
  for (const attachment of attachments) {
    if (!isValidPrincipal(attachment.principal) || !known.has(attachment.policy)) {
      ignored.push(attachment);
      continue;
    }
    const row: AttachmentRow = [attachment.principal, policySubject(attachment.policy)];
    rows.set(JSON.stringify(row), row);
  }
  return { rows: [...rows.values()], ignored };
}
