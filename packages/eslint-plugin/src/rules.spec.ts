import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";
import plugin from "./index.js";
import {
  findDecorator,
  findEnclosingClass,
  getClassExtendsName,
  getDecoratorName,
  isModelClass,
  isServiceClass
} from "./utils.js";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser as any,
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: "module"
    }
  }
});

describe("@webda/eslint-plugin rules", () => {
  tester.run("prefer-operation-over-route", plugin.rules["prefer-operation-over-route"], {
    valid: [
      `class MyService extends Service {
        @Operation()
        async doWork(ctx: OperationContext<MyInput, MyOutput>) {}
      }`,
      `class MyModel extends CoreModel {
        @Action()
        async publish(ctx: OperationContext<void, void>) {}
      }`,
      `class PlainClass {
        @Webda.Operation()
        async ok() {}
      }`
    ],
    invalid: [
      {
        code: `class MyService extends Service {
          @Route("/hello", ["GET"])
          hello(ctx: WebContext) {}
        }`,
        errors: [{ messageId: "preferOperation" }]
      },
      {
        code: `class MyModel extends CoreModel {
          @Route("/custom", ["POST"])
          custom(ctx: WebContext) {}
        }`,
        errors: [{ messageId: "preferAction" }]
      }
    ]
  });

  tester.run("operation-typing", plugin.rules["operation-typing"], {
    valid: [
      `class MyService extends Service {
        @Operation()
        async run(ctx: OperationContext<InputDto, OutputDto>) {}
      }`,
      `class MyService extends Service {
        @Operation()
        async ping(name: string): Promise<string> { return name; }
      }`,
      `class MyService extends Service {
        @Operation()
        async handle(ctx: WebContext) {}
        helper() {}
      }`
    ],
    invalid: [
      {
        code: `class MyService extends Service {
          @Operation()
          async run(ctx: OperationContext) {}
        }`,
        errors: [{ messageId: "untypedContext" }]
      },
      {
        code: `class MyService extends Service {
          @Operation()
          async ping(name: string) { return name; }
        }`,
        errors: [{ messageId: "missingReturnType" }]
      }
    ]
  });

  tester.run("model-extends-core-model", plugin.rules["model-extends-core-model"], {
    valid: [
      {
        filename: "src/models/user.model.ts",
        code: `export class UserModel extends CoreModel { name: string = ""; }`
      },
      {
        filename: "src/models/post.model.ts",
        code: `export class PostModel extends OwnerModel { title: string = ""; }`
      },
      {
        filename: "src/services/helper.ts",
        code: `export class PlainHelper { help() {} }`
      },
      {
        filename: "src/models/base.model.ts",
        code: `export abstract class BaseModel {} export class HelperDto {} export class CustomModel extends CoreModel {}`
      },
      {
        filename: "src/models/sub.model.ts",
        code: `export class SubModel extends Webda.CoreModel {}`
      }
    ],
    invalid: [
      {
        filename: "src/models/item.model.ts",
        code: `export class ItemModel { id: string = ""; }`,
        errors: [{ messageId: "mustExtendModel" }]
      }
    ]
  });

  tester.run("model-action-decorator", plugin.rules["model-action-decorator"], {
    valid: [
      `class PostModel extends CoreModel {
        @Action()
        async publish(ctx: OperationContext<void, void>) {}
      }`,
      `class PostModel extends CoreModel {
        private helper(ctx: OperationContext) {}
        canAct(ctx: OperationContext) {}
        authorizeClientEvent(ctx: OperationContext) {}
      }`,
      `class NotAModel {
        async run(ctx: OperationContext) {}
      }`
    ],
    invalid: [
      {
        code: `class PostModel extends CoreModel {
          async publish(ctx: OperationContext<void, void>) {}
        }`,
        errors: [{ messageId: "missingActionDecorator" }]
      }
    ]
  });

  tester.run("no-manual-service-instantiation", plugin.rules["no-manual-service-instantiation"], {
    valid: [
      {
        filename: "src/services/app.service.ts",
        code: `const svc = this.getService<MailerService>("Mailer");`
      },
      {
        filename: "src/services/app.service.spec.ts",
        code: `const svc = new MailerService(app, "mailer", {});`
      },
      {
        filename: "src/services/app.service.ts",
        code: `const params = new MyServiceParameters({});`
      },
      {
        filename: "src/services/app.service.ts",
        code: `const custom = new AllowedService();`,
        options: [{ allowedClasses: ["AllowedService"] }]
      }
    ],
    invalid: [
      {
        filename: "src/services/app.service.ts",
        code: `const svc = new MailerService(app, "mailer", {});`,
        errors: [{ messageId: "noManualNew" }]
      },
      {
        filename: "src/services/app.service.ts",
        code: `const store = new MemoryStore(app, "store", {});`,
        errors: [{ messageId: "noManualNew" }]
      },
      {
        filename: "src/services/app.service.ts",
        code: `const nsSvc = new Webda.MailerService(app, "mailer", {});`,
        errors: [{ messageId: "noManualNew" }]
      }
    ]
  });

  tester.run("no-service-constructor-di", plugin.rules["no-service-constructor-di"], {
    valid: [
      `class MyService extends Service {
        async resolve() {
          await super.resolve();
          this.mailer = this.getService("Mailer");
        }
      }`
    ],
    invalid: [
      {
        code: `class MyService extends Service {
          constructor(webda: any, name: string, params: any) {
            super(webda, name, params);
            this.mailer = this.getService("Mailer");
          }
        }`,
        errors: [{ messageId: "noGetServiceInConstructor" }]
      }
    ]
  });

  tester.run("service-bean-decorator", plugin.rules["service-bean-decorator"], {
    valid: [
      `@Bean
      export class MyService extends Service {}`,
      `export abstract class BaseService extends Service {}`,
      `class InternalService extends Service {}`,
      `export class PlainUtility {}`
    ],
    invalid: [
      {
        code: `export class MyService extends Service {}`,
        errors: [{ messageId: "missingBeanDecorator" }]
      }
    ]
  });

  tester.run("prefer-use-log", plugin.rules["prefer-use-log"], {
    valid: [
      {
        filename: "src/services/app.service.ts",
        code: `const log = useLog("App"); log.info("hello");`
      },
      {
        filename: "src/services/app.service.spec.ts",
        code: `console.log("debug in test");`
      }
    ],
    invalid: [
      {
        filename: "src/services/app.service.ts",
        code: `console.log("hello");`,
        errors: [{ messageId: "preferUseLog" }]
      }
    ]
  });

  tester.run("prefer-webda-error", plugin.rules["prefer-webda-error"], {
    valid: [
      {
        filename: "src/services/app.service.ts",
        code: `throw new WebdaError.BadRequest("invalid");`
      },
      {
        filename: "src/services/app.service.spec.ts",
        code: `throw new Error("test failure");`
      }
    ],
    invalid: [
      {
        filename: "src/services/app.service.ts",
        code: `throw new Error("bad");`,
        errors: [{ messageId: "preferWebdaError" }]
      }
    ]
  });

  it("utils handle edge cases gracefully", () => {
    expect(getDecoratorName(null)).toBeUndefined();
    expect(getDecoratorName({ expression: { type: "Literal" } })).toBeUndefined();
    expect(findDecorator({}, "Operation")).toBeUndefined();
    expect(getClassExtendsName({})).toBeUndefined();
    expect(
      getClassExtendsName({
        superClass: { type: "MemberExpression", property: { type: "Identifier", name: "CoreModel" } }
      })
    ).toBe("CoreModel");
    expect(getClassExtendsName({ superClass: { type: "CallExpression" } })).toBeUndefined();
    expect(isModelClass({})).toBe(false);
    expect(isServiceClass({})).toBe(false);
    expect(findEnclosingClass({})).toBeUndefined();
  });
});
