import { Operation } from "@webda/core";
import { UuidModel } from "@webda/models";

/**
 * Test model implementation
 */
export class TestModel extends UuidModel {
  /**
   * Name
   */
  name: string;
  /**
   * Email
   */
  email: string;

  /**
   * Perform do something
   * @param input - the input
   * @param count - the count
   * @returns the result
   */
  @Operation()
  async doSomething(input: string, count: number): Promise<{ success: boolean; message: string }> {
    return { success: true, message: input };
  }

  /**
   * Perform global action
   * @param query - the query
   * @returns the result
   */
  @Operation({ description: "A static global operation" })
  static async globalAction(query: string): Promise<string[]> {
    return [query];
  }

  /**
   * Perform instance action
   * @returns true if the operation succeeded
   */
  @Operation()
  instanceAction(): boolean {
    return true;
  }
}
