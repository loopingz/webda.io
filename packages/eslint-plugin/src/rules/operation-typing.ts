import type { Rule } from "eslint";
import { findDecorator, getDecoratorName, getParameterTypeAnnotation } from "../utils.js";

/**
 * Rule: operation-typing
 *
 * Ensures methods decorated with `@Operation()` or `@Action()` declare typed inputs/outputs
 * (either `OperationContext<Input, Output>` or an explicit return type annotation) so the
 * Webda compiler can generate accurate OpenAPI and operation schemas.
 */
const rule: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Require typed OperationContext<In, Out> or explicit return type on @Operation/@Action methods",
      recommended: true
    },
    schema: [],
    messages: {
      untypedContext:
        "OperationContext should specify type arguments (e.g. OperationContext<Input, Output>) for schema generation.",
      missingReturnType:
        "Method decorated with @{{decorator}} should declare an explicit return type or use OperationContext<Input, Output>."
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
        const dec = findDecorator(node, ["Operation", "Action"]);
        if (!dec) {
          return;
        }
        const fn = node.value;
        /* v8 ignore start -- defensive guard: MethodDefinition always has a value */
        if (!fn) {
          return;
        }
        /* v8 ignore stop */
        const params: any[] = fn.params;
        for (const param of params) {
          const typeNode = getParameterTypeAnnotation(param);
          if (
            typeNode?.type === "TSTypeReference" &&
            typeNode.typeName?.type === "Identifier" &&
            (typeNode.typeName.name === "OperationContext" || typeNode.typeName.name === "WebContext")
          ) {
            const typeArgs = typeNode.typeArguments;
            if (typeNode.typeName.name === "OperationContext" && (!typeArgs || !typeArgs.params?.length)) {
              context.report({
                node: typeNode,
                messageId: "untypedContext"
              });
            }
            return;
          }
        }
        // If no OperationContext parameter, check for explicit return type
        if (!fn.returnType) {
          const decName = getDecoratorName(dec)!;
          context.report({
            node: node.key,
            messageId: "missingReturnType",
            data: { decorator: decName }
          });
        }
      }
    };
  }
};

export default rule;
