import { createCoreHook } from "../core/instancestorage";

const [useRouter, setRouter] = createCoreHook("router");

export { useRouter, setRouter };
