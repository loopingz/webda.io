import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { OAuthClient, OAuthServerParameters } from "./parameters.js";

/** Maximum size of a Client ID Metadata Document */
const MAX_DOCUMENT = 64 * 1024;
/** Maximum length of a redirect_uri */
const MAX_REDIRECT_URI = 2048;
/** Maximum number of redirect URIs accepted from a metadata document */
const MAX_REDIRECT_URIS = 20;
/** Maximum number of cached metadata documents */
const MAX_CACHE = 1000;
/** Lifetime of a cached metadata document failure (s) */
const NEGATIVE_CACHE_TTL = 60;
/** Hosts matching any port for http redirect URIs (RFC 8252 §7.3) */
const LOOPBACK_HOSTS = ["127.0.0.1", "localhost", "[::1]"];
/** Schemes that must never be used as redirect URIs */
const FORBIDDEN_SCHEMES = ["javascript:", "data:", "file:", "vbscript:", "blob:", "about:", "ftp:", "ws:", "wss:"];

/**
 * @param ip - IPv4 address
 * @returns true for any non public unicast range
 */
function isPrivateIPv4(ip: string): boolean {
  const [a, b, c] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

/**
 * @param ip - IPv6 address, possibly with an embedded IPv4 or a zone id
 * @returns the eight 16-bit groups, undefined when invalid
 */
function expandIPv6(ip: string): number[] | undefined {
  let addr = ip.split("%")[0];
  const v4 = addr.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    if (isIP(v4[2]) !== 4) return undefined;
    const [a, b, c, d] = v4[2].split(".").map(Number);
    addr = `${v4[1]}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = addr.split("::");
  if (halves.length > 2) return undefined;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return undefined;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...tail].map(g =>
    /^[0-9a-f]{1,4}$/i.test(g) ? parseInt(g, 16) : NaN
  );
  return groups.some(isNaN) ? undefined : groups;
}

/**
 * @param hi - high 16 bits
 * @param lo - low 16 bits
 * @returns dotted IPv4
 */
function toIPv4(hi: number, lo: number): string {
  return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
}

/**
 * Fail-closed classification: anything that is not a public unicast address (or is not an IP at all) is private
 *
 * @param ip - address
 * @returns true for loopback, private, link-local, unique-local, multicast, reserved or unspecified addresses
 */
export function isPrivateAddress(ip: string): boolean {
  if (typeof ip !== "string") return true;
  const family = isIP(ip.split("%")[0]);
  if (family === 4) return isPrivateIPv4(ip);
  if (family !== 6) return true;
  const g = expandIPv6(ip);
  if (!g) return true;
  // ::/96 (unspecified, loopback, IPv4-compatible) and ::ffff:0:0/96 (IPv4-mapped)
  if (g.slice(0, 5).every(x => x === 0) && (g[5] === 0 || g[5] === 0xffff)) return true;
  // NAT64 64:ff9b::/96 embeds an IPv4; 64:ff9b:1::/48 is local-use
  if (g[0] === 0x64 && g[1] === 0xff9b) {
    return g.slice(2, 6).every(x => x === 0) ? isPrivateIPv4(toIPv4(g[6], g[7])) : true;
  }
  // 6to4 2002::/16 embeds an IPv4
  if (g[0] === 0x2002) return isPrivateIPv4(toIPv4(g[1], g[2]));
  return (
    (g[0] === 0x100 && g[1] === 0 && g[2] === 0 && g[3] === 0) || // discard-only 100::/64
    (g[0] === 0x2001 && g[1] === 0) || // Teredo 2001::/32
    (g[0] === 0x2001 && g[1] === 0xdb8) || // documentation
    (g[0] & 0xfe00) === 0xfc00 || // unique local fc00::/7
    (g[0] & 0xffc0) === 0xfe80 || // link-local fe80::/10
    (g[0] & 0xffc0) === 0xfec0 || // deprecated site-local fec0::/10
    (g[0] & 0xff00) === 0xff00 // multicast
  );
}

/**
 * @param uri - redirect URI from an untrusted metadata document
 * @returns true when it is acceptable: https, loopback http, or a private-use scheme
 */
function isAcceptableDocumentRedirect(uri: unknown): boolean {
  if (typeof uri !== "string" || uri.length > MAX_REDIRECT_URI) return false;
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.hash || url.username || url.password || FORBIDDEN_SCHEMES.includes(url.protocol)) return false;
  if (url.protocol === "http:") return LOOPBACK_HOSTS.includes(url.hostname);
  return true;
}

/**
 * @param value - untrusted value
 * @returns the value when it is an https URL
 */
function httpsUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > MAX_REDIRECT_URI) return undefined;
  try {
    return new URL(value).protocol === "https:" ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Copy a client definition into a plain object
 *
 * Configuration objects can be Proxies (comment-preserving JSONC loader), which
 * `structuredClone` rejects with a DataCloneError. A client is plain JSON data,
 * so a JSON round trip is a faithful copy.
 *
 * @param client - client definition
 * @returns a detached plain copy
 */
function copyClient<T>(client: T): T {
  return JSON.parse(JSON.stringify(client));
}

/** Resolve clients: static configuration, then Client ID Metadata Documents */
export class ClientRegistry {
  /** Metadata documents by client_id, in least recently used order */
  protected cache = new Map<string, { client?: OAuthClient; until: number }>();
  /** Metadata document fetches in progress */
  protected inflight = new Map<string, Promise<OAuthClient | undefined>>();

  /**
   * @param params - server parameters
   * @param fetcher - fetch implementation
   * @param resolver - DNS resolver
   */
  constructor(
    protected params: OAuthServerParameters,
    protected fetcher: typeof fetch = fetch,
    protected resolver: (host: string) => Promise<string[]> = async host =>
      (await lookup(host, { all: true })).map(r => r.address)
  ) {}

  /**
   * @param clientId - client_id
   * @returns the client, undefined when unknown or invalid
   */
  async get(clientId: string): Promise<OAuthClient | undefined> {
    if (typeof clientId !== "string" || !clientId) return undefined;
    if (Object.prototype.hasOwnProperty.call(this.params.clients, clientId)) {
      const configured = this.params.clients[clientId];
      return configured ? { ...copyClient(configured), id: clientId } : undefined;
    }
    if (
      !this.params.clientMetadataDocuments ||
      clientId.length > MAX_REDIRECT_URI ||
      !clientId.startsWith("https://")
    ) {
      return undefined;
    }
    const now = Date.now();
    const cached = this.cache.get(clientId);
    if (cached && cached.until > now) {
      // Refresh LRU position
      this.cache.delete(clientId);
      this.cache.set(clientId, cached);
      return cached.client && copyClient(cached.client);
    }
    let pending = this.inflight.get(clientId);
    if (!pending) {
      pending = this.load(clientId).finally(() => this.inflight.delete(clientId));
      this.inflight.set(clientId, pending);
    }
    const client = await pending;
    return client && copyClient(client);
  }

  /**
   * Fetch a metadata document and cache the result
   *
   * @param clientId - metadata document URL
   * @returns the client
   */
  protected async load(clientId: string): Promise<OAuthClient | undefined> {
    const client = await this.fetchDocument(clientId).catch(() => undefined);
    const ttl = client
      ? this.params.clientMetadataCacheTtl
      : Math.min(NEGATIVE_CACHE_TTL, this.params.clientMetadataCacheTtl);
    const now = Date.now();
    this.cache.delete(clientId);
    for (const [id, entry] of this.cache) {
      if (entry.until <= now) this.cache.delete(id);
    }
    while (this.cache.size >= MAX_CACHE) {
      this.cache.delete(this.cache.keys().next().value!);
    }
    this.cache.set(clientId, { client, until: now + ttl * 1000 });
    return client;
  }

  /**
   * @param url - metadata document URL
   * @returns the client
   */
  protected async fetchDocument(url: string): Promise<OAuthClient | undefined> {
    const target = new URL(url);
    if (target.protocol !== "https:" || target.username || target.password || target.hash) return undefined;
    // WHATWG URL keeps the brackets around IPv6 literals
    const host = target.hostname.replace(/^\[(.*)\]$/, "$1");
    const allowed = this.params.clientMetadataHosts.map(h => h.toLowerCase());
    if (allowed.length && !allowed.includes(target.hostname)) return undefined;
    // Listed hosts are trusted by configuration and bypass the private address check
    if (!allowed.length) {
      // Limitation: the address checked here and the one fetch() connects to come from two DNS lookups, so a
      // rebinding DNS server can still steer the request to a private address. Impact is limited: https only
      // (a valid certificate for the name is required) and the response must be JSON whose client_id equals the
      // URL, otherwise it is discarded and never exposed. Inject a fetcher pinning the validated address at
      // connect time to close it.
      if (host === "localhost" || host.endsWith(".localhost")) return undefined;
      const addresses = isIP(host) ? [host] : await this.resolver(host);
      if (!addresses.length || addresses.some(isPrivateAddress)) return undefined;
    }
    const signal = AbortSignal.timeout(this.params.clientMetadataTimeout * 1000);
    const res = await this.fetcher(url, {
      redirect: "error",
      signal,
      headers: { accept: "application/json" }
    });
    if (!res.ok || res.status !== 200) return undefined;
    if (Number(res.headers.get("content-length") ?? 0) > MAX_DOCUMENT) return undefined;
    const text = await this.readLimited(res);
    if (text === undefined) return undefined;
    const doc = JSON.parse(text);
    if (
      typeof doc !== "object" ||
      doc === null ||
      doc.client_id !== url ||
      !Array.isArray(doc.redirect_uris) ||
      doc.redirect_uris.length === 0 ||
      doc.redirect_uris.length > MAX_REDIRECT_URIS ||
      !doc.redirect_uris.every(isAcceptableDocumentRedirect)
    ) {
      return undefined;
    }
    return {
      id: url,
      name: typeof doc.client_name === "string" && doc.client_name ? doc.client_name.slice(0, 100) : target.hostname,
      redirect_uris: [...doc.redirect_uris],
      logo: httpsUrl(doc.logo_uri),
      client_uri: httpsUrl(doc.client_uri),
      deviceFlow: false,
      metadataDocument: true
    };
  }

  /**
   * Read the body, giving up as soon as it exceeds the maximum document size
   *
   * @param res - response
   * @returns the body, undefined when too large
   */
  protected async readLimited(res: Response): Promise<string | undefined> {
    if (!res.body) return "";
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_DOCUMENT) {
        await reader.cancel().catch(() => {});
        return undefined;
      }
      chunks.push(value);
    }
    return new TextDecoder().decode(Buffer.concat(chunks));
  }

  /**
   * @param client - client
   * @param uri - requested redirect_uri
   * @returns true when allowed: exact match, or loopback http with any port and identical path
   */
  matchRedirect(client: OAuthClient, uri: string): boolean {
    if (typeof uri !== "string" || uri.length > MAX_REDIRECT_URI || !Array.isArray(client?.redirect_uris)) return false;
    let requested: URL;
    try {
      requested = new URL(uri);
    } catch {
      return false;
    }
    if (requested.hash || requested.username || requested.password) return false;
    return client.redirect_uris.some(registered => {
      if (registered === uri) return true;
      let reg: URL;
      try {
        reg = new URL(registered);
      } catch {
        return false;
      }
      return (
        reg.protocol === "http:" &&
        requested.protocol === "http:" &&
        LOOPBACK_HOSTS.includes(reg.hostname) &&
        requested.hostname === reg.hostname &&
        requested.pathname === reg.pathname &&
        requested.search === "" &&
        // Rejects anything URL silently normalised: dot-segments, case, backslashes, empty or padded ports...
        uri === `http://${requested.host}${reg.pathname}`
      );
    });
  }
}
