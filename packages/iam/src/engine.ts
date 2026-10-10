import { Enforcer, newEnforcer, newModelFromString } from "casbin";
import { AttachmentRow, PolicyRow } from "./compiler.js";

/**
 * Casbin model: deny wins, implicit deny; `attached` resolves policy attachments, `skipInput` implements probe mode
 */
export const CASBIN_MODEL = `
[request_definition]
r = sub, op, ctx

[policy_definition]
p = sub, op, eft, cond, probe

[role_definition]
g = _, _

[policy_effect]
e = some(where (p.eft == allow)) && !some(where (p.eft == deny))

[matchers]
m = attached(r.sub, p.sub) && globMatch(r.op, p.op) && (skipInput(r.ctx, p.probe) ? p.eft == "allow" : !!(eval(p.cond)))
`;

/**
 * The `r.ctx` object conditions read
 */
export interface IAMRequestContext {
  operationId: string;
  probe: boolean;
  user?: { uuid: string; groups: string[]; roles: string[] };
  session?: any;
  input?: any;
  http?: { method: string; ip: string; host: string };
  now: number;
}

/**
 * An immutable snapshot of the compiled policies
 */
export class PolicyEngine {
  /**
   * @param enforcer - the Casbin enforcer
   */
  private constructor(protected enforcer: Enforcer) {}

  /**
   * Build an engine from compiled rows
   * @param policies - the `p` rows
   * @param attachments - the `g` rows
   * @returns the engine
   */
  static async build(policies: PolicyRow[], attachments: AttachmentRow[]): Promise<PolicyEngine> {
    // Matcher functions run synchronously: attachments are resolved from this map, built from the same g rows
    const links = new Map<string, Set<string>>();
    for (const [principal, sub] of attachments) {
      if (!links.has(sub)) {
        links.set(sub, new Set());
      }
      links.get(sub).add(principal);
    }
    const enforcer = await newEnforcer(newModelFromString(CASBIN_MODEL));
    await enforcer.addFunction("attached", (principals: string[], sub: string) =>
      Array.isArray(principals) ? principals.some(principal => links.get(sub)?.has(principal)) : false
    );
    await enforcer.addFunction(
      "skipInput",
      (ctx: IAMRequestContext, probe: string) => ctx?.probe === true && probe === "input"
    );
    await enforcer.addFunction(
      "includes",
      (list: unknown, value: unknown) => Array.isArray(list) && list.includes(value)
    );
    if (policies.length) {
      await enforcer.addPolicies(policies);
    }
    if (attachments.length) {
      await enforcer.addGroupingPolicies(attachments);
    }
    return new PolicyEngine(enforcer);
  }

  /**
   * Decide whether principals may call an operation
   * @param principals - the caller principals
   * @param operationId - the operation id
   * @param ctx - the request context
   * @returns true when allowed, otherwise the refusal reason; an evaluation error is a refusal
   */
  async decide(principals: string[], operationId: string, ctx: IAMRequestContext): Promise<true | string> {
    try {
      const [allowed, explain] = await this.enforcer.enforceEx(principals, operationId, ctx);
      if (allowed) {
        return true;
      }
      return explain?.length ? `denied by ${explain.join(", ")}` : "implicit deny";
    } catch (err) {
      return `condition error: ${err?.message ?? err}`;
    }
  }
}
