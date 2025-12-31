export type Flags = "a" | "b" | "c";
export type Mapped = { [K in Flags]: number };
/**
 * TODO: Fix this test to actually test something
 */
export interface DemoMappedHolder {
  mapped: Mapped;
}
