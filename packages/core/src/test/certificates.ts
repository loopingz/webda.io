import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

/** Key and certificate files of a test certificate */
export interface TestCertificateFiles {
  /** Private key file */
  key: string;
  /** Certificate file */
  cert: string;
  /** PEM content of the certificate */
  pem: string;
}

/** Certificates generated for mTLS tests */
export interface TestCertificates {
  /** Temporary directory holding the files */
  dir: string;
  /** Client CA */
  ca: TestCertificateFiles;
  /** Server certificate for localhost/127.0.0.1 (self-signed) */
  server: TestCertificateFiles;
  /** Client certificate signed by `ca`: O=Webda, OU=dev, OU=ops, CN=alice, email:alice@example.com */
  client: TestCertificateFiles;
  /** Client certificate signed by `ca` without subject alternative name: CN=bob */
  bob: TestCertificateFiles;
  /** Client certificate signed by another CA: CN=mallory */
  untrusted: TestCertificateFiles;
  /** Remove the files */
  cleanup: () => void;
}

const CONFIG = `[req]
distinguished_name = dn
prompt = no
[dn]
CN = unused
[ca]
basicConstraints = critical,CA:TRUE
keyUsage = critical,keyCertSign,cRLSign
subjectKeyIdentifier = hash
[server]
basicConstraints = CA:FALSE
subjectAltName = DNS:localhost,IP:127.0.0.1
extendedKeyUsage = serverAuth
[alice]
basicConstraints = CA:FALSE
subjectAltName = email:alice@example.com,URI:spiffe://example.com/alice
extendedKeyUsage = clientAuth
[bob]
basicConstraints = CA:FALSE
extendedKeyUsage = clientAuth
`;

/**
 * Generate a CA, a server certificate and client certificates with openssl
 * @returns the certificates, call cleanup() when done
 */
export function createTestCertificates(): TestCertificates {
  const dir = mkdtempSync(join(tmpdir(), "webda-mtls-"));
  const config = join(dir, "openssl.cnf");
  writeFileSync(config, CONFIG);
  const openssl = (...args: string[]) => execFileSync("openssl", args, { stdio: "pipe", cwd: dir });
  const keyArgs = ["-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes"];
  const files = (name: string): TestCertificateFiles => ({
    key: join(dir, `${name}.key`),
    cert: join(dir, `${name}.crt`),
    pem: ""
  });
  const selfSigned = (name: string, subject: string, extensions: string) => {
    const f = files(name);
    openssl(
      "req",
      "-x509",
      "-config",
      config,
      "-extensions",
      extensions,
      ...keyArgs,
      "-keyout",
      f.key,
      "-out",
      f.cert,
      "-days",
      "2",
      "-subj",
      subject
    );
    f.pem = readFileSync(f.cert, "utf-8");
    return f;
  };
  const signed = (name: string, subject: string, extensions: string, ca: TestCertificateFiles) => {
    const f = files(name);
    const csr = join(dir, `${name}.csr`);
    openssl("req", "-new", "-config", config, ...keyArgs, "-keyout", f.key, "-out", csr, "-subj", subject);
    openssl(
      "x509",
      "-req",
      "-in",
      csr,
      "-CA",
      ca.cert,
      "-CAkey",
      ca.key,
      "-set_serial",
      `0x${randomBytes(8).toString("hex")}`,
      "-out",
      f.cert,
      "-days",
      "2",
      "-extfile",
      config,
      "-extensions",
      extensions
    );
    f.pem = readFileSync(f.cert, "utf-8");
    return f;
  };
  const ca = selfSigned("ca", "/O=Webda/CN=Webda Test CA", "ca");
  const otherCa = selfSigned("other-ca", "/CN=Other CA", "ca");
  return {
    dir,
    ca,
    server: selfSigned("server", "/CN=localhost", "server"),
    client: signed("alice", "/O=Webda/OU=dev/OU=ops/CN=alice", "alice", ca),
    bob: signed("bob", "/CN=bob", "bob", ca),
    untrusted: signed("mallory", "/CN=mallory", "bob", otherCa),
    cleanup: () => rmSync(dir, { recursive: true, force: true })
  };
}
