import { Operation } from "@webda/core";
import { UuidModel } from "@webda/models";

export class TestModel extends UuidModel {
  name: string;
  email: string;

  @Operation()
  async doSomething(input: string, count: number): Promise<{ success: boolean; message: string }> {
    return { success: true, message: input };
  }

  @Operation({ description: "A static global operation" })
  static async globalAction(query: string): Promise<string[]> {
    return [query];
  }

  @Operation()
  instanceAction(): boolean {
    return true;
  }
}
