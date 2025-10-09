import { useService } from "../core/hooks.js";
import { Router } from "./router.js";

/**
 * Return the Router service
 *
 * @returns
 */
export function useRouter(): Router {
  return useService("Router");
}
