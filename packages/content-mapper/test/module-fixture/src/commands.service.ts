import { BuildCommand, Command } from "./decorators.js";

/** @WebdaCapability request-filter */
export interface RequestFilter {
  checkRequest(): boolean;
}

/**
 * @WebdaCapability  cache extra words are ignored
 */
export interface Cache {
  get(): unknown;
}

/** Not a capability. */
export interface Plain {
  plain(): void;
}

export class Base {}

export class Tooling extends Base implements RequestFilter, Plain, Cache {
  checkRequest(): boolean {
    return true;
  }
  get(): unknown {
    return undefined;
  }
  plain(): void {}

  @Command("greet", { description: "Say hello", requires: ["router", 1 as any, "store"], phase: "initialized" })
  greet(
    /** @alias n @description Name to greet */
    name: string,
    times: number = 2,
    loud?: boolean,
    /** @deprecated */
    polite: boolean = false,
    tag: "a" | "b" = "a"
  ) {}

  @BuildCommand({ description: "Build it", phase: "initialized" })
  build() {}

  @Command("nameless-phase", { phase: "bogus" })
  other() {}

  // Not a string literal name: ignored.
  @Command(42 as any)
  ignored() {}

  // Bare decorator is not a call: ignored.
  @Command
  bare() {}

  notACommand() {}
}
