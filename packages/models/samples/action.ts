import { Constructor } from "@webda/tsc-esm";
import { ExposableMetadata } from "../src/exposable";
import { ActionsEnum } from "../src";

function ActionWrapper<T extends (...args: any[]) => any>(
  action: T,
  description: string
): T & { description: string; action: true } {
  const actionWrapped = action as T & { description: string; action: true };
  actionWrapped.description = description;
  actionWrapped.action = true;
  return actionWrapped;
}

const Exposed = new WeakMap<any, ExposableMetadata>();

function Expose(options: { types?: string[]; plural?: string } = {}) {
  return (target: any) => {
    if (!Exposed.has(target)) {
      Exposed.set(target, options as ExposableMetadata);
    }
    return target;
  };
}

Expose.get = function (key: any): undefined | ExposableMetadata {
  // Implementation for the get decorator
  return Exposed.get(key);
};

function ActionSuper(target: any, method: string, ...args: any[]): any {
  return new (Object.getPrototypeOf(Object.getPrototypeOf(target).constructor))(this)[method](...args);
}

class Test {
  hello = ActionWrapper((name: string) => {
    return `Hello ${name}`;
  }, "Say hello to someone");

  static getConfiguration<T extends Test>(this: Constructor<T, any[]>) {
    console.log(this);
    return Object.freeze({
      expose: Exposed.get(this) as ExposableMetadata,
      actions: []
    });
  }
}

@Expose({ types: ["create", "get", "update", "delete", "actions"], plural: "tests" })
class Test2 extends Test {
  constructor(protected lang: string) {
    super();
  }
  hello = ActionWrapper((name: string) => {
    if (this.lang === "fr") {
      return `Bonjour ${name}`;
    }
    return ActionSuper(this, "hello", name);
  }, "Say hello to someone");

  async canAct(action: ActionsEnum<Test2>): Promise<boolean | string> {
    if (action === "create" || action === "get" || action === "update" || action === "delete") {
      return true;
    } else if (action === "hello") {
      return this.lang === "fr";
    }
    return false;
  }
}

console.log(new Test().hello("John"));
console.log(new Test2("fr").hello("John"));
console.log(new Test2("en").hello("John"));
console.log(Expose.get(Test2)); // { types: ["create", "get", "update", "delete", "actions"], plural: "tests" }
console.log(Test.getConfiguration()); // { expose: { types: ["create", "get", "update", "delete", "actions"], plural: "tests" }, actions: [] }
console.log(Test2.getConfiguration()); // { expose: { types: ["create", "get", "update", "delete", "actions"], plural: "tests" }, actions: [] }
