import { Bean, Operation, Service, ServiceParameters } from "@webda/core";

class TestBeanParameters extends ServiceParameters {
  setting: string;
}

@Bean
export class TestBean extends Service<TestBeanParameters> {
  @Operation()
  async asyncWithObject(): Promise<{ name: string; count: number }> {
    return { name: "", count: 0 };
  }

  @Operation()
  syncWithObject(): { label: string; active: boolean } {
    return { label: "", active: false };
  }

  @Operation()
  syncPrimitive(): string {
    return "";
  }
}
