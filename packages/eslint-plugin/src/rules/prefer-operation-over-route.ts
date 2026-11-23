import type { Rule } from "eslint";
import { findDecorator, findEnclosingClass, isModelClass } from "../utils.js";

/**
 * Rule: prefer-operation-over-route
 *
 * Encourages using `@Operation()` (or `@Action()` on models) instead of low-level `@Route()`,
 * so Webda can generate typed OpenAPI schemas, operations metadata, and sealed clients.
 */
const rule: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Prefer @Operation() or @Action() over raw @Route() for typed operations and OpenAPI generation",
      recommended: true
    },
    schema: [],
    messages: {
      preferOperation: "Prefer @Operation() over @Route() on services for typed OpenAPI/operations support.",
      preferAction: "Prefer @Action() or @Operation() over @Route() on model methods."
    }
  },
  /**
   * Create rule listeners
   * @param context - ESLint rule context
   * @returns Visitor listeners
   */
  create(context) {
    return {
      MethodDefinition: (node: any) => {
        const routeDec = findDecorator(node, "Route");
        if (!routeDec) {
          return;
        }
        const enclosingClass = findEnclosingClass(node);
        const onModel = isModelClass(enclosingClass);
        context.report({
          node: routeDec,
          messageId: onModel ? "preferAction" : "preferOperation"
        });
      }
    };
  }
};

export default rule;
