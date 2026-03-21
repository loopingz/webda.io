export interface UnionWithFunction {
  value: string | Function;
  allFunctions: Function | ((...args: any[]) => void);
}
