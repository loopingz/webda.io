import { suite, test } from "@webda/test";
import * as assert from "assert";
import { X509Certificate } from "node:crypto";
import { afterAll } from "vitest";
import {
  parseClientCertificateHeader,
  parseDistinguishedName,
  parseSubjectAltName,
  toClientCertificate
} from "./clientcertificate.js";
import { HttpContext } from "./httpcontext.js";
import { createTestCertificates } from "../test/certificates.js";

const certs = createTestCertificates();
afterAll(() => certs.cleanup());

/**
 * @param pem - PEM certificate
 * @returns the base64 DER without armour nor new lines, as Traefik sends it
 */
function stripArmour(pem: string): string {
  return pem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, "").replace(/\s/g, "");
}

@suite
class ClientCertificateTest {
  @test
  distinguishedName() {
    const { attributes, dn } = parseDistinguishedName("O=Webda\nOU=dev\nOU=ops\nCN=alice");
    assert.deepStrictEqual(attributes, { O: "Webda", OU: ["dev", "ops"], CN: "alice" });
    assert.strictEqual(dn, "O=Webda, OU=dev, OU=ops, CN=alice");
    assert.deepStrictEqual(parseDistinguishedName(undefined as any), { attributes: {}, dn: "" });
    // Node.js quotes values with special characters
    assert.deepStrictEqual(parseDistinguishedName('CN="a, b"').attributes, { CN: "a, b" });
  }

  @test
  subjectAltName() {
    assert.strictEqual(parseSubjectAltName(undefined), undefined);
    assert.deepStrictEqual(parseSubjectAltName('DNS:a.example.com, email:a@example.com, URI:"spiffe://x/a,b"'), [
      "DNS:a.example.com",
      "email:a@example.com",
      "URI:spiffe://x/a,b"
    ]);
  }

  @test
  fromX509() {
    const cert = toClientCertificate(new X509Certificate(certs.client.pem), true, "tls");
    assert.deepStrictEqual(cert.subject, { O: "Webda", OU: ["dev", "ops"], CN: "alice" });
    assert.strictEqual(cert.subjectDN, "O=Webda, OU=dev, OU=ops, CN=alice");
    assert.strictEqual(cert.issuer.CN, "Webda Test CA");
    assert.strictEqual(cert.issuerDN, "O=Webda, CN=Webda Test CA");
    assert.deepStrictEqual(cert.san, ["email:alice@example.com", "URI:spiffe://example.com/alice"]);
    assert.match(cert.fingerprint256, /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
    assert.ok(cert.validFrom.getTime() <= Date.now() && cert.validTo.getTime() > Date.now());
    assert.strictEqual(cert.raw?.trim(), certs.client.pem.trim());
    assert.strictEqual(cert.verified, true);
    assert.strictEqual(cert.source, "tls");
    assert.strictEqual(toClientCertificate(new X509Certificate(certs.bob.pem), false, "proxy").san, undefined);
  }

  @test
  traefikHeader() {
    const leaf = encodeURIComponent(stripArmour(certs.client.pem));
    const chain = `${leaf},${encodeURIComponent(stripArmour(certs.ca.pem))}`;
    assert.strictEqual(parseClientCertificateHeader(chain)?.subject, "O=Webda\nOU=dev\nOU=ops\nCN=alice");
    assert.strictEqual(parseClientCertificateHeader(leaf, "traefik")?.subject.endsWith("CN=alice"), true);
    // Full PEM is accepted too
    assert.ok(parseClientCertificateHeader(encodeURIComponent(certs.client.pem), "traefik"));
    assert.strictEqual(parseClientCertificateHeader("", "traefik"), undefined);
    assert.throws(() => parseClientCertificateHeader("bm90LWEtY2VydA%3D%3D", "traefik"));
  }

  @test
  pemHeader() {
    const x509 = parseClientCertificateHeader(encodeURIComponent(certs.bob.pem), "pem-urlencoded");
    assert.strictEqual(x509?.subject, "CN=bob");
    assert.throws(() => parseClientCertificateHeader("garbage", "pem-urlencoded"));
  }

  @test
  xfccHeader() {
    const element = (pem: string) =>
      `By=spiffe://example.com/webda;Hash=abc;Cert="${encodeURIComponent(pem)}";Subject="CN=x"`;
    // The last element was added by the closest proxy
    const value = `${element(certs.untrusted.pem)},${element(certs.client.pem)}`;
    assert.ok(parseClientCertificateHeader(value, "xfcc")?.subject.endsWith("CN=alice"));
    assert.strictEqual(parseClientCertificateHeader("By=spiffe://x;Hash=abc", "xfcc"), undefined);
  }

  @test
  httpContext() {
    const ctx = new HttpContext("test.webda.io", "GET", "/");
    assert.strictEqual(ctx.getClientCertificate(), undefined);
    const cert = toClientCertificate(new X509Certificate(certs.client.pem), true, "proxy");
    assert.strictEqual(ctx.setClientCertificate(cert), ctx);
    assert.strictEqual(ctx.getClientCertificate(), cert);
    ctx.setClientCertificate(undefined);
    assert.strictEqual(ctx.getClientCertificate(), undefined);
  }
}
