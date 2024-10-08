import { useService } from "../core/hooks";
import { Router } from "./router";

/**
 * Return the Router service
 *
 * @returns
 */
export function useRouter(): Router {
  return useService("Router");
}
