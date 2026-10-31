import { createChecker } from "is-in-subnet";

/**
 * Create a matcher for a list of CIDRs
 *
 * A bare IP address is read as a /32 network. A value that is not an IP address (or is undefined) is never in the
 * networks: the checker does not throw.
 * @param cidrs - the CIDRs or IP addresses
 * @returns a function telling if an IP address belongs to one of the networks
 */
export function createSubnetChecker(cidrs: string[]): (ip: string) => boolean {
  const check = createChecker(cidrs.map(n => (n.indexOf("/") < 0 ? `${n.trim()}/32` : n.trim())));
  return ip => {
    try {
      return check(ip);
    } catch {
      return false;
    }
  };
}
