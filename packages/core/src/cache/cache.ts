import { useContext } from "../contexts/execution";
import { useInstanceStorage } from "../core/instancestorage";
import { createCacheAnnotation, ProcessCache } from "@webda/cache";

const SessionCache = createCacheAnnotation(() => useContext().getSession());
const InstanceCache = createCacheAnnotation(() => useInstanceStorage());
const ContextCache = createCacheAnnotation(() => useContext());

export { SessionCache, InstanceCache, ContextCache, ProcessCache };
