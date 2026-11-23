import type { ESLint, Linter } from "eslint";
import modelActionDecorator from "./rules/model-action-decorator.js";
import modelExtendsCoreModel from "./rules/model-extends-core-model.js";
import noManualServiceInstantiation from "./rules/no-manual-service-instantiation.js";
import noServiceConstructorDi from "./rules/no-service-constructor-di.js";
import operationTyping from "./rules/operation-typing.js";
import preferOperationOverRoute from "./rules/prefer-operation-over-route.js";
import preferUseLog from "./rules/prefer-use-log.js";
import preferWebdaError from "./rules/prefer-webda-error.js";
import serviceBeanDecorator from "./rules/service-bean-decorator.js";

/**
 * All Webda ESLint rules
 */
export const rules = {
  "prefer-operation-over-route": preferOperationOverRoute,
  "operation-typing": operationTyping,
  "model-extends-core-model": modelExtendsCoreModel,
  "model-action-decorator": modelActionDecorator,
  "no-manual-service-instantiation": noManualServiceInstantiation,
  "no-service-constructor-di": noServiceConstructorDi,
  "service-bean-decorator": serviceBeanDecorator,
  "prefer-use-log": preferUseLog,
  "prefer-webda-error": preferWebdaError
};

/**
 * Webda ESLint plugin object
 */
const plugin: ESLint.Plugin & {
  configs: {
    recommended: Linter.Config;
    strict: Linter.Config;
  };
} = {
  meta: {
    name: "@webda/eslint-plugin",
    version: "4.0.0-rc.1"
  },
  rules,
  configs: {} as {
    recommended: Linter.Config;
    strict: Linter.Config;
  }
};

plugin.configs = {
  recommended: {
    name: "@webda/eslint-plugin/recommended",
    plugins: {
      webda: plugin
    },
    rules: {
      "webda/prefer-operation-over-route": "warn",
      "webda/operation-typing": "warn",
      "webda/model-extends-core-model": "error",
      "webda/model-action-decorator": "error",
      "webda/no-manual-service-instantiation": "error",
      "webda/no-service-constructor-di": "error",
      "webda/service-bean-decorator": "warn",
      "webda/prefer-use-log": "warn",
      "webda/prefer-webda-error": "warn"
    }
  },
  strict: {
    name: "@webda/eslint-plugin/strict",
    plugins: {
      webda: plugin
    },
    rules: {
      "webda/prefer-operation-over-route": "error",
      "webda/operation-typing": "error",
      "webda/model-extends-core-model": "error",
      "webda/model-action-decorator": "error",
      "webda/no-manual-service-instantiation": "error",
      "webda/no-service-constructor-di": "error",
      "webda/service-bean-decorator": "error",
      "webda/prefer-use-log": "error",
      "webda/prefer-webda-error": "error"
    }
  }
};

export default plugin;
