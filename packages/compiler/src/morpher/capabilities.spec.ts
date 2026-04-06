import { Project } from "ts-morph";
import { suite, test, expect } from "vitest";
import { removeFilterRegistrations } from "./capabilities";

suite("removeFilterRegistrations", () => {
  function transform(source: string): string {
    const project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile("test.ts", source);
    removeFilterRegistrations(sourceFile);
    return sourceFile.getFullText();
  }

  test("removes this.getWebda().registerRequestFilter(this)", () => {
    const input = `class MyService {
  resolve() {
    super.resolve();
    this.getWebda().registerRequestFilter(this);
    return this;
  }
}`;
    const result = transform(input);
    expect(result).not.toContain("registerRequestFilter");
    expect(result).toContain("super.resolve()");
    expect(result).toContain("return this;");
  });

  test("removes this.getWebda().registerCORSFilter(this)", () => {
    const input = `class MyService {
  resolve() {
    super.resolve();
    this.getWebda().registerCORSFilter(this);
    return this;
  }
}`;
    const result = transform(input);
    expect(result).not.toContain("registerCORSFilter");
    expect(result).toContain("super.resolve()");
  });

  test("removes both registerRequestFilter and registerCORSFilter when both present", () => {
    const input = `class MyService {
  resolve() {
    super.resolve();
    this.getWebda().registerRequestFilter(this);
    this.getWebda().registerCORSFilter(this);
    return this;
  }
}`;
    const result = transform(input);
    expect(result).not.toContain("registerRequestFilter");
    expect(result).not.toContain("registerCORSFilter");
    expect(result).toContain("super.resolve()");
    expect(result).toContain("return this;");
  });

  test("preserves calls with non-this arguments", () => {
    const input = `class MyService {
  resolve() {
    super.resolve();
    this.getWebda().registerRequestFilter({ checkRequest: async () => true });
    return this;
  }
}`;
    const result = transform(input);
    expect(result).toContain("registerRequestFilter");
    expect(result).toContain("checkRequest");
  });

  test("removes commented-out filter registration calls", () => {
    const input = `class MyService {
  resolve() {
    super.resolve();
    //this._webda.registerRequestFilter(this);
    return this;
  }
}`;
    const result = transform(input);
    expect(result).not.toContain("registerRequestFilter");
    expect(result).toContain("super.resolve()");
    expect(result).toContain("return this;");
  });

  test("preserves other code in the same method", () => {
    const input = `class MyService {
  resolve() {
    super.resolve();
    this.doSetup();
    useRouter().registerRequestFilter(this);
    this.configure();
    return this;
  }
}`;
    const result = transform(input);
    expect(result).not.toContain("registerRequestFilter");
    expect(result).toContain("super.resolve()");
    expect(result).toContain("this.doSetup()");
    expect(result).toContain("this.configure()");
    expect(result).toContain("return this;");
  });

  test("no-op when no matching calls exist", () => {
    const input = `class MyService {
  resolve() {
    super.resolve();
    this.doSomethingElse();
    return this;
  }
}`;
    const result = transform(input);
    expect(result).toBe(input);
  });

  test("removes useRouter().registerRequestFilter(this)", () => {
    const input = `class MyService {
  resolve() {
    super.resolve();
    useRouter().registerRequestFilter(this);
    return this;
  }
}`;
    const result = transform(input);
    expect(result).not.toContain("registerRequestFilter");
    expect(result).toContain("super.resolve()");
  });

  test("removes this._webda.registerCORSFilter(this)", () => {
    const input = `class MyService {
  resolve() {
    super.resolve();
    this._webda.registerCORSFilter(this);
    return this;
  }
}`;
    const result = transform(input);
    expect(result).not.toContain("registerCORSFilter");
    expect(result).toContain("super.resolve()");
  });

  test("removes this.webda.registerRequestFilter(this)", () => {
    const input = `class MyService {
  resolve() {
    super.resolve();
    this.webda.registerRequestFilter(this);
    return this;
  }
}`;
    const result = transform(input);
    expect(result).not.toContain("registerRequestFilter");
    expect(result).toContain("super.resolve()");
  });
});
