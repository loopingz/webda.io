import type { Rule } from "eslint";
import { findDecorator, findEnclosingClass, getParameterTypeAnnotation, isModelClass } from "../utils.js";

/**
 * Rule: model-action-decorator
 *
 * Ensures public methods on Webda Model classes that accept an `OperationContext` or
 * `WebContext` parameter are decorated with `@Action()` or `@Operation()` so they are
 * exposed as model operations.
 */
const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Require @Action() or @Operation() on model methods accepting OperationContext",
      recommended: true
    },
    schema: [],
    messages: {
      missingActionDecorator:
        "Model method '{{name}}' accepts {{contextType}} and should be decorated with @Action() or @Operation()."
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
        if (node.kind !== "method" || node.accessibility === "private" || node.accessibility === "protected") {
          return;
        }
        const methodName = node.key?.name;
        if (
          methodName === "canAct" ||
          methodName === "authorizeClientEvent" ||
          methodName === "toStoredJSON" ||
          methodName === "validate"
        ) {
          return;
        }
        const enclosingClass = findEnclosingClass(node);
        if (!enclosingClass || !isModelClass(enclosingClass)) {
          return;
        }
        if (findDecorator(node, ["Action", "Operation", "Route"])) {
          return;
        }
        const params: any[] = node.value?.params || [];
        for (const param of params) {
          const typeNode = getParameterTypeAnnotation(param);
          if (
            typeNode?.type === "TSTypeReference" &&
            typeNode.typeName?.type === "Identifier" &&
            (typeNode.typeName.name === "OperationContext" || typeNode.typeName.name === "WebContext")
          ) {
            const methodName = node.key?.name || "<anonymous>";
            context.report({
              node: node.key || node,
              messageId: "missingActionDecorator",
              data: { name: methodName, contextType: typeNode.typeName.name }
            });
            return;
          }
        }
      }
    };
  }
};

export default rule;
