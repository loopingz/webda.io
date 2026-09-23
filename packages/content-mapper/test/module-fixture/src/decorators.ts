// Stand-ins for the @webda/core decorators: the generator reads them by name.
export function Command(..._args: any[]): any {
  return () => {};
}
export function BuildCommand(..._args: any[]): any {
  return () => {};
}
export function Action(..._args: any[]): any {
  return () => {};
}
export function Operation(..._args: any[]): any {
  return () => {};
}
