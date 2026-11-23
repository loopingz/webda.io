import type { Rule } from "eslint";

/**
 * Rule: model-extends-core-model
 *
 * Ensures classes in `*.model.ts` (or in a `models/` directory) extend `CoreModel`,
 * `OwnerModel`, or another `*Model` base class so Webda's compiler discovers them as models.
 */
const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Ensure Webda model classes extend CoreModel, OwnerModel, or another Model",
      recommended: true
    },
    schema: [],
    messages: {
      mustExtendModel: "Model class '{{name}}' must extend CoreModel, OwnerModel, or another *Model class."
    }
  },
  /**
   * Create rule listeners
   * @param context - ESLint rule context
   * @returns Visitor listeners
   */
  create(context) {
    const filename = context.filename;
    const isModelFile = /\.model\.[jt]sx?$/.test(filename) || /[/\\]models[/\\]/.test(filename);
    if (!isModelFile) {
      return {};
    }

    return {
      ClassDeclaration: (node: any) => {
        if (node.abstract || !node.id?.name) {
          return;
        }
        // Only check classes explicitly named *Model (sub-objects/fields in *.model.ts don't need CoreModel)
        if (!node.id.name.endsWith("Model")) {
          return;
        }
        if (node.superClass) {
          return;
        }
        context.report({
          node: node.id,
          messageId: "mustExtendModel",
          data: { name: node.id.name }
        });
      }
    };
  }
};

export default rule;
