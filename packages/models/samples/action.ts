function ActionWrapper<T extends (...args: any[]) => any>(
  action: T,
  description: string
): T & { description: string; action: true } {
  const actionWrapped = action as T & { description: string; action: true };
  actionWrapped.description = description;
  actionWrapped.action = true;
  return actionWrapped;
}

function ActionSuper(target: any, method: string, ...args: any[]): any {
  return new (Object.getPrototypeOf(Object.getPrototypeOf(target).constructor))(this)[method](...args);
}

class Test {
  hello = ActionWrapper((name: string) => {
    return `Hello ${name}`;
  }, "Say hello to someone");
}

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
}

console.log(new Test().hello("John"));
console.log(new Test2("fr").hello("John"));
console.log(new Test2("en").hello("John"));
