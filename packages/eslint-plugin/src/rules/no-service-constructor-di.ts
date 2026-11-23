import type { Rule } from "eslint";
import { findEnclosingClass, isServiceClass } from "../utils.js";

/**
 * Rule: no-service-constructor-di
 *
 * Prevents calling `this.getService(...)` inside a Service constructor, because
 * Webda resolves dependencies during `resolve()` / `init()`, not during construction.
 */
const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow calling this.getService() inside Service constructors; use resolve() or init() instead",
      recommended: true
    },
    schema: [],
    messages: {
      noGetServiceInConstructor:
        "Do not call `this.getService()` in a Service constructor. Move dependency lookup to `resolve()` or `init()`."
    }
  },
  /**
   * Create rule listeners
   * @param context - ESLint rule context
   * @returns Visitor listeners
   */
  create(context) {
    let inServiceConstructor = false;

    return {
      "MethodDefinition[kind='constructor']": (node: any) => {
        const enclosingClass = findEnclosingClass(node);
        if (enclosingClass && isServiceClass(enclosingClass)) {
          inServiceConstructor = true;
        }
      },
      "MethodDefinition[kind='constructor']:exit": () => {
        inServiceConstructor = false;
      },
      CallExpression: (node: any) => {
        if (!inServiceConstructor) {
          return;
        }
        const callee = node.callee;
        if (
          callee?.type === "MemberExpression" &&
          callee.object?.type === "ThisExpression" &&
          callee.property?.type === "Identifier" &&
          callee.property.name === "getService"
        ) {
          context.report({
            node,
            messageId: "noGetServiceInConstructor"
          });
        }
      }
    };
  }
};

export default rule;
