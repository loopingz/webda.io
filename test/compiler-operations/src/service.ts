import { Bean, Operation, Service, ServiceParameters } from "@webda/core";

/**
 * Configuration parameters for TestBean
 */
class TestBeanParameters extends ServiceParameters {
  /**
   * Setting
   */
  setting: string;
}

/**
 * Test bean implementation
 */
@Bean
export class TestBean extends Service<TestBeanParameters> {
  /**
   * Perform async with object
   * @returns the result
   */
  @Operation()
  async asyncWithObject(): Promise<{ name: string; count: number }> {
    return { name: "", count: 0 };
  }

  /**
   * Sync with object
   * @returns the result
   */
  @Operation()
  syncWithObject(): { label: string; active: boolean } {
    return { label: "", active: false };
  }

  /**
   * Sync primitive
   * @returns the resulting string
   */
  @Operation()
  syncPrimitive(): string {
    return "";
  }
}
