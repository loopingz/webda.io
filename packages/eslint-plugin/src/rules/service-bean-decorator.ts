import type { Rule } from "eslint";
import { findDecorator, isServiceClass } from "../utils.js";

/**
 * Rule: service-bean-decorator
 *
 * Encourages decorating application Service classes with `@Bean` (or `@Modda`)
 * so they are automatically registered in Webda's dependency injection container.
 */
const rule: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Require @Bean (or @Modda) decorator on non-abstract Service classes",
      recommended: true
    },
    schema: [],
    messages: {
      missingBeanDecorator:
        "Service class '{{name}}' should be decorated with @Bean (or @Modda) for Webda DI registration."
    }
  },
  /**
   * Create rule listeners
   * @param context - ESLint rule context
   * @returns Visitor listeners
   */
  create(context) {
    return {
      ClassDeclaration: (node: any) => {
        if (node.abstract || !node.id?.name) {
          return;
        }
        const isExported =
          node.parent?.type === "ExportNamedDeclaration" || node.parent?.type === "ExportDefaultDeclaration";
        if (!isExported || !isServiceClass(node)) {
          return;
        }
        if (!findDecorator(node, ["Bean", "Modda"])) {
          context.report({
            node: node.id,
            messageId: "missingBeanDecorator",
            data: { name: node.id.name }
          });
        }
      }
    };
  }
};

export default rule;
