import { createChecker } from "is-in-subnet";
import { isIP } from "node:net";

/**
 * Create a matcher for a list of CIDRs
 *
 * A bare IP address is read as a single address network: /32 for IPv4, /128 for IPv6. IPv4-mapped IPv6 addresses
 * (`::ffff:10.0.0.1`, as reported by dual-stack Node sockets) match the IPv4 networks. A value that is not an IP address (or is undefined) is never in the
 * networks: the checker does not throw.
 * @param cidrs - the CIDRs or IP addresses
 * @returns a function telling if an IP address belongs to one of the networks
 */
export function createSubnetChecker(cidrs: string[]): (ip: string) => boolean {
  const check = createChecker(
    cidrs.map(n => {
      const value = n.trim();
      if (value.includes("/")) return value;
      return `${value}/${isIP(value) === 6 ? 128 : 32}`;
    })
  );
  return ip => {
    try {
      return check(ip);
    } catch {
      return false;
    }
  };
}
