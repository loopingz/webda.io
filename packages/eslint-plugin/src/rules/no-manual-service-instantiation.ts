import type { Rule } from "eslint";
import { isTestFile } from "../utils.js";

/**
 * Rule: no-manual-service-instantiation
 *
 * Prevents manually instantiating Webda Services or Stores with `new FooService(...)`
 * or `new FooStore(...)`. Services should be obtained via dependency injection
 * (`@Bean`, `@Inject`, or `this.getService(...)`).
 */
const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow manual instantiation of Webda Services/Stores; use Dependency Injection instead",
      recommended: true
    },
    schema: [
      {
        type: "object",
        properties: {
          allowedClasses: {
            type: "array",
            items: { type: "string" }
          }
        },
        additionalProperties: false
      }
    ],
    messages: {
      noManualNew:
        "Do not manually instantiate '{{name}}' with `new`. Use Dependency Injection (@Bean, @Inject, or this.getService()) instead."
    }
  },
  /**
   * Create rule listeners
   * @param context - ESLint rule context
   * @returns Visitor listeners
   */
  create(context) {
    const filename = context.filename;
    if (isTestFile(filename)) {
      return {};
    }
    const allowed = new Set<string>(context.options?.[0]?.allowedClasses || ["ServiceParameters"]);

    return {
      NewExpression: (node: any) => {
        const callee = node.callee;
        let className: string | undefined;
        if (callee?.type === "Identifier") {
          className = callee.name;
        } else if (callee?.type === "MemberExpression" && callee.property?.type === "Identifier") {
          className = callee.property.name;
        }
        if (!className || allowed.has(className)) {
          return;
        }
        if ((className.endsWith("Service") || className.endsWith("Store")) && !className.endsWith("Parameters")) {
          context.report({
            node,
            messageId: "noManualNew",
            data: { name: className }
          });
        }
      }
    };
  }
};

export default rule;
