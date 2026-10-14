import { X509Certificate } from "node:crypto";

/**
 * X.509 client certificate presented with a request (mTLS)
 */
export interface ClientCertificate {
  /**
   * Subject attributes, a repeated attribute (several OU) is a list
   *
   * @example { CN: "alice", OU: ["dev", "ops"] }
   */
  subject: Record<string, string | string[]>;
  /**
   * Subject distinguished name, attributes in certificate order separated by ", "
   *
   * @example "O=Webda, CN=alice"
   */
  subjectDN: string;
  /**
   * Issuer attributes, a repeated attribute is a list
   */
  issuer: Record<string, string | string[]>;
  /**
   * Issuer distinguished name, attributes in certificate order separated by ", "
   */
  issuerDN: string;
  /**
   * Serial number (hexadecimal)
   */
  serialNumber: string;
  /**
   * SHA-256 fingerprint, uppercase hexadecimal pairs separated by ":"
   */
  fingerprint256: string;
  /**
   * Start of validity
   */
  validFrom: Date;
  /**
   * End of validity
   */
  validTo: Date;
  /**
   * Subject alternative names as "<type>:<value>"
   *
   * @example ["email:alice@example.com", "URI:spiffe://example.com/alice", "DNS:alice.example.com"]
   */
  san?: string[];
  /**
   * PEM encoded certificate
   */
  raw?: string;
  /**
   * Whether the certificate chain was verified against a trusted CA (by the TLS stack or by the trusted proxy)
   */
  verified: boolean;
  /**
   * Where the certificate comes from: the TLS socket, or a header set by a trusted proxy
   */
  source: "tls" | "proxy";
}

/**
 * Format of a header carrying the client certificate forwarded by a proxy
 *
 * - `traefik`: url-encoded base64 DER without PEM armour, comma-separated chain (Traefik `passTLSClientCert` with
 *   `pem: true`); full PEM blocks are also accepted
 * - `pem-urlencoded`: url-encoded PEM (nginx `$ssl_client_escaped_cert`)
 * - `xfcc`: Envoy `x-forwarded-client-cert`, the `Cert` field of the last element (the one added by the closest proxy)
 */
export type ClientCertificateHeaderFormat = "traefik" | "pem-urlencoded" | "xfcc";

/**
 * Split a string on a separator, ignoring separators within double quotes
 * @param value - the string to split
 * @param separator - single character separator
 * @returns the parts, trimmed
 */
function splitOutsideQuotes(value: string, separator: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === "\\" && quoted && i + 1 < value.length) {
      current += c + value[++i];
      continue;
    }
    if (c === '"') {
      quoted = !quoted;
    } else if (c === separator && !quoted) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += c;
  }
  parts.push(current.trim());
  return parts.filter(p => p !== "");
}

/**
 * Remove the double quotes around a value, as Node.js quotes names containing special characters
 * @param value - the value
 * @returns the unquoted value
 */
function unquote(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      return value.substring(1, value.length - 1);
    }
  }
  return value;
}

/**
 * Parse a distinguished name as formatted by Node.js `X509Certificate` (one "KEY=value" per line)
 * @param name - the formatted name
 * @returns the attributes and the one-line distinguished name
 */
export function parseDistinguishedName(name: string): { attributes: Record<string, string | string[]>; dn: string } {
  const attributes: Record<string, string | string[]> = {};
  const lines = (name || "").split("\n").filter(l => l.includes("="));
  for (const line of lines) {
    const idx = line.indexOf("=");
    const key = line.substring(0, idx).trim();
    const value = unquote(line.substring(idx + 1).trim());
    const current = attributes[key];
    if (current === undefined) {
      attributes[key] = value;
    } else {
      attributes[key] = [...(Array.isArray(current) ? current : [current]), value];
    }
  }
  return { attributes, dn: lines.map(l => l.trim()).join(", ") };
}

/**
 * Parse the subject alternative names as formatted by Node.js `X509Certificate.subjectAltName`
 * @param san - "DNS:a, email:b, URI:c"
 * @returns the names as "<type>:<value>"
 */
export function parseSubjectAltName(san: string | undefined): string[] | undefined {
  if (!san) {
    return undefined;
  }
  return splitOutsideQuotes(san, ",").map(entry => {
    const idx = entry.indexOf(":");
    return idx < 0 ? entry : `${entry.substring(0, idx)}:${unquote(entry.substring(idx + 1))}`;
  });
}

/**
 * Describe a parsed X.509 certificate
 * @param x509 - the certificate
 * @param verified - whether its chain was verified
 * @param source - where it comes from
 * @returns the client certificate
 */
export function toClientCertificate(
  x509: X509Certificate,
  verified: boolean,
  source: ClientCertificate["source"]
): ClientCertificate {
  const subject = parseDistinguishedName(x509.subject);
  const issuer = parseDistinguishedName(x509.issuer);
  return {
    subject: subject.attributes,
    subjectDN: subject.dn,
    issuer: issuer.attributes,
    issuerDN: issuer.dn,
    serialNumber: x509.serialNumber,
    fingerprint256: x509.fingerprint256,
    validFrom: new Date(x509.validFrom),
    validTo: new Date(x509.validTo),
    san: parseSubjectAltName(x509.subjectAltName),
    raw: x509.toString(),
    verified,
    source
  };
}

/**
 * Parse the first certificate of a PEM bundle, or of a base64 DER without PEM armour
 * @param value - PEM or base64
 * @returns the certificate
 * @throws Error when the value is not a certificate
 */
function parseCertificate(value: string): X509Certificate {
  const pem = value.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/);
  if (pem) {
    return new X509Certificate(pem[0]);
  }
  return new X509Certificate(Buffer.from(value.replace(/\s/g, ""), "base64"));
}

/**
 * Parse the client certificate forwarded by a proxy in a header
 * @param value - the header value
 * @param format - the header format
 * @returns the leaf certificate, undefined when the header holds none
 * @throws Error when the header is malformed
 */
export function parseClientCertificateHeader(
  value: string,
  format: ClientCertificateHeaderFormat = "traefik"
): X509Certificate | undefined {
  if (!value?.trim()) {
    return undefined;
  }
  if (format === "pem-urlencoded") {
    return parseCertificate(decodeURIComponent(value));
  }
  if (format === "xfcc") {
    const elements = splitOutsideQuotes(value, ",");
    const fields = splitOutsideQuotes(elements[elements.length - 1] ?? "", ";");
    const cert = fields.find(f => /^cert=/i.test(f));
    if (!cert) {
      return undefined;
    }
    return parseCertificate(decodeURIComponent(unquote(cert.substring(5))));
  }
  // Traefik: the chain is comma-separated, the leaf comes first
  const decoded = decodeURIComponent(value);
  if (decoded.includes("-----BEGIN")) {
    return parseCertificate(decoded);
  }
  return parseCertificate(decoded.split(",")[0]);
}
