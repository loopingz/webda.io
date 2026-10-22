import { useInstanceStorage } from "../core/instancestorage.js";

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

/**
 * @returns the protected resources of the current instance
 */
function useResources(): ProtectedResource[] {
  const storage = useInstanceStorage();
  storage.protectedResources ??= [];
  return storage.protectedResources as ProtectedResource[];
}

/**
 * Register a protected resource, replacing any previous one on the same path
 * @param resource - the resource
 */
export function registerProtectedResource(resource: ProtectedResource): void {
  unregisterProtectedResource(resource.path);
  useResources().push(resource);
}

/**
 * Unregister a protected resource
 * @param path - the resource path
 */
export function unregisterProtectedResource(path: string): void {
  const resources = useResources();
  const index = resources.findIndex(r => r.path === path);
  if (index >= 0) {
    resources.splice(index, 1);
  }
}

/**
 * @returns the registered protected resources
 */
export function listProtectedResources(): ProtectedResource[] {
  return [...useResources()];
}

/**
 * @param origin - origin of the application, used for the resources without a canonical URI
 * @returns the absolute URI of every registered resource
 */
export function resolveProtectedResources(origin: string): string[] {
  const base = origin.replace(/\/+$/, "");
  return useResources().map(r => r.uri ?? base + r.path);
}
