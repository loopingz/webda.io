import { useDynamicService } from "../core/hooks.js";
import { Router } from "./router.js";

/**
 * Return the Router service
 *
 * @returns the result
 */
export function useRouter(): Router {
  return useDynamicService<Router>("Router");
}
