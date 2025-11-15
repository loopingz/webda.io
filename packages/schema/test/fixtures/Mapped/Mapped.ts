export type Flags = 'a' | 'b' | 'c';
export type Mapped = { [K in Flags]: number };
export interface DemoMappedHolder {
  mapped: Mapped;
}
