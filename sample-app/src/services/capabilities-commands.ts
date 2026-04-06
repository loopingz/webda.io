import { Command, RequestFilter, Service } from "@webda/core";

/**
 * Test service that exercises both @Command decorators and @WebdaCapability interfaces.
 *
 * @WebdaModda
 */
export class TestCommandService extends Service implements RequestFilter {
  /**
   * A test command that greets someone.
   */
  @Command("greet", { description: "Greet a user by name" })
  async greet(
    /** @alias n */
    name: string = "world",
    /** @alias v */
    verbose: boolean = false
  ): Promise<void> {
    // Test command implementation
  }

  /**
   * A command with a required argument.
   */
  @Command("deploy", { description: "Deploy a resource" })
  async deploy(
    /** @alias t */
    target: string,
    /** @alias d */
    dryRun: boolean = false
  ): Promise<void> {
    // Deploy command implementation
  }

  /** Check whether the incoming request should be accepted (always returns true). */
  async checkRequest(): Promise<boolean> {
    return true;
  }
}
