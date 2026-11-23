import type { Rule } from "eslint";
import { isTestFile } from "../utils.js";

const CONSOLE_METHODS = new Set(["log", "warn", "error", "info", "debug"]);

/**
 * Rule: prefer-use-log
 *
 * Disallows `console.log/warn/error/info/debug` in non-test files, recommending
 * `useLog` from `@webda/workout` or `this.log(...)` on Services.
 */
const rule: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Prefer useLog() from @webda/workout or this.log() over console.*",
      recommended: true
    },
    schema: [],
    messages: {
      preferUseLog: "Avoid `console.{{method}}()`. Use `useLog` from `@webda/workout` or `this.log()` in a Service."
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
      CallExpression: (node: any) => {
        const callee = node.callee;
        if (
          callee?.type === "MemberExpression" &&
          callee.object?.type === "Identifier" &&
          callee.object.name === "console" &&
          callee.property?.type === "Identifier" &&
          CONSOLE_METHODS.has(callee.property.name)
        ) {
          context.report({
            node,
            messageId: "preferUseLog",
            data: { method: callee.property.name }
          });
        }
      }
    };
  }
};

export default rule;
