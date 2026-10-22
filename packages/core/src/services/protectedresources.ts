/**
 * A protected resource server (for example an MCP endpoint) registered so the OAuth server can advertise it
 * and bind tokens to it (RFC 8707), without the resource server depending on the OAuth package.
 */
export interface ProtectedResource {
  /** Application relative path of the resource */
  path: string;
  /** Canonical absolute URI, when known (`publicUrl` set) */
  uri?: string;
}

const resources: ProtectedResource[] = [];

/**
 * Register a protected resource, replacing any previous one on the same path
 * @param resource - the resource
 */
export function registerProtectedResource(resource: ProtectedResource): void {
  unregisterProtectedResource(resource.path);
  resources.push(resource);
}

/**
 * Unregister a protected resource
 * @param path - the resource path
 */
export function unregisterProtectedResource(path: string): void {
  const index = resources.findIndex(r => r.path === path);
  if (index >= 0) {
    resources.splice(index, 1);
  }
}

/**
 * @returns the registered protected resources
 */
export function listProtectedResources(): ProtectedResource[] {
  return [...resources];
}

/**
 * @param origin - origin of the application, used for the resources without a canonical URI
 * @returns the absolute URI of every registered resource
 */
export function resolveProtectedResources(origin: string): string[] {
  const base = origin.replace(/\/+$/, "");
  return resources.map(r => r.uri ?? base + r.path);
}
