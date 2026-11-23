import type { Rule } from "eslint";
import { isTestFile } from "../utils.js";

/**
 * Rule: prefer-webda-error
 *
 * Encourages throwing `WebdaError` subclasses (from `@webda/core`) instead of
 * generic `new Error(...)` so HTTP status codes and error handling work consistently.
 */
const rule: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Prefer throwing WebdaError subclasses over generic Error",
      recommended: true
    },
    schema: [],
    messages: {
      preferWebdaError:
        "Prefer throwing a `WebdaError` subclass (e.g. `WebdaError.BadRequest`) instead of generic `Error`."
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

    return {
      ThrowStatement: (node: any) => {
        const arg = node.argument;
        if (arg?.type === "NewExpression" && arg.callee?.type === "Identifier" && arg.callee.name === "Error") {
          context.report({
            node: arg,
            messageId: "preferWebdaError"
          });
        }
      }
    };
  }
};

export default rule;
