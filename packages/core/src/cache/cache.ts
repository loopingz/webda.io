import { useContext } from "../contexts/execution.js";
import { useInstanceStorage } from "../core/instancestorage.js";
import { createCacheAnnotation, ProcessCache } from "@webda/cache";

/**
 * Cache storage of each session, kept out of the session data: the session proxy would wrap the cache map (a
 * `Map` method then fails on the proxy) and the session would be marked dirty and saved with it
 */
const sessionCaches = new WeakMap<object, object>();

const SessionCache = createCacheAnnotation(() => {
  const session: object | undefined = useContext().getSession();
  if (!session) {
    return null;
  }
  if (!sessionCaches.has(session)) {
    sessionCaches.set(session, {});
  }
  return sessionCaches.get(session)!;
});
const InstanceCache = createCacheAnnotation(() => useInstanceStorage());
const ContextCache = createCacheAnnotation(() => useContext());

export { SessionCache, InstanceCache, ContextCache, ProcessCache };
