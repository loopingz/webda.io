# Configuration Secrets

Secrets can be committed encrypted in `webda.config.jsonc`, a deployment file or a dynamic configuration source (file,
Kubernetes ConfigMap, store...). Webda decrypts them when it loads the configuration, before any service uses them.

## Quick start

1. Prefix the plain value with `encrypt:<encrypter>:`, here a Google Cloud KMS key:

```jsonc title="webda.config.jsonc"
{
  "services": {
    "db": {
      "type": "PostgresStore",
      "postgresqlServer": {
        "host": "db.example.com",
        // Encrypted by `webda config encrypt`
        "password": "encrypt:gcp:my-db-password"
      }
    }
  }
}
```

2. Run the command: it replaces the marked values in place and keeps the comments (json, jsonc and yaml). Without
   `-f`, it updates `webda.config` and, with `-d <deployment>`, the deployment file.

```bash
webda config encrypt
```

```jsonc title="webda.config.jsonc"
        "password": "crypt:gcp:cHJvamVjdHMv...:CiQAk3Jx..."
```

3. Commit the file: the service receives the decrypted value at runtime.

The `config encrypt` and `config pki` commands only load the application: they do not start it. The secrets already
in the configuration are not decrypted and the configuration sources are not loaded, so they run on any machine, without
access to the KMS key or to the private keys. Add `-d <deployment>` to use the encryption settings of a deployment.

## Where to put secrets

Encrypted secrets can live in any configuration file. Where to put them depends on who encrypts them and where the
application can decrypt them:

- **`webda.config.jsonc`**: shared by every environment. Fits an encrypter every environment can use, like a KMS key
  (`gcp`) the application identity can decrypt everywhere.
- **A deployment file** (`deployments/<name>.jsonc`): secrets of one environment, decrypted with its own keys.
- **A configuration source** loaded at runtime: secrets that change without rebuilding the application, or that each
  environment provides differently.

### Example: a local file for development, an encrypted ConfigMap in Kubernetes

Keep the application configuration free of secrets and load them from a configuration source, which each environment
maps to its own place:

| Environment       | Configuration source                            | Secrets                                       |
| ----------------- | ----------------------------------------------- | --------------------------------------------- |
| Local development | `FileConfiguration` on `local.config.jsonc`     | plain values, the file is ignored by git      |
| Deployed (k8s)    | `KubernetesConfigurationService` on a ConfigMap | encrypted with the `pki` encrypter, committed |

```mermaid
flowchart LR
  subgraph Repo["Git repository"]
    CFG["webda.config.jsonc<br/>no secret"]
    DEP["deployments/production.jsonc<br/>Configuration: KubernetesConfigurationService"]
    CM["k8s/webda.jsonc<br/>crypt:pki:v1:..."]
    PUB[".webda/keys/*.pub.pem"]
  end
  LOCAL["local.config.jsonc<br/>(gitignored, plain)"] --> DEV["webda debug"]
  CFG --> DEV
  CM -->|kubectl create configmap| POD["Pod"]
  SEC["Secret webda-pki<br/>private keys"] -->|/etc/webda/pki| POD
  DEP --> POD
```

#### 1. The application: no secret, a file source for development

```jsonc title="webda.config.jsonc"
{
  "application": {
    "configurationService": "Configuration"
  },
  "parameters": {
    "configurationEncryption": {
      "default": "pki",
      "encrypters": { "pki": { "activeKey": "2026-10" } }
    }
  },
  "services": {
    // Local development: plain secrets in a file ignored by git
    "Configuration": {
      "type": "Webda/FileConfiguration",
      "source": "local.config.jsonc"
    },
    "db": {
      "type": "PostgresStore",
      "postgresqlServer": { "host": "localhost" }
    }
  }
}
```

```jsonc title="local.config.jsonc (gitignored)"
{
  "services": {
    "db": { "postgresqlServer": { "password": "dev-password" } }
  }
}
```

#### 2. The deployment: a Kubernetes ConfigMap source

```jsonc title="deployments/production.jsonc"
{
  "services": {
    "Configuration": {
      "type": "Webda/KubernetesConfigurationService",
      // Replaces the local.config.jsonc source
      "source": "/etc/webda/config"
    }
  }
}
```

The ConfigMap holds a `webda.jsonc` (or `.json`, `.yaml`) file with the same format, its secrets marked for
encryption:

```jsonc title="k8s/webda.jsonc"
{
  "services": {
    "db": {
      "postgresqlServer": {
        "host": "db.example.com",
        "password": "encrypt:prod-password"
      }
    }
  }
}
```

#### 3. Encrypt, commit, deploy

Encrypt it with the settings of the deployment, then commit it. Only the [public keys](#pki-encrypter) are needed: the
ConfigMap is not mounted on this machine, and the command does not load it.

```bash
webda -d production config encrypt -f k8s/webda.jsonc
```

```jsonc title="k8s/webda.jsonc"
        "password": "crypt:pki:v1:2026-10:EhzAG7iH...:WinJzRQm..."
```

Create the ConfigMap from it, and mount it with the [private keys Secret](#kubernetes):

```bash
kubectl create configmap webda-config --from-file=webda.jsonc=k8s/webda.jsonc
```

```yaml
volumes:
  - name: webda-config
    configMap: { name: webda-config }
containers:
  - name: app
    volumeMounts:
      - { name: webda-config, mountPath: /etc/webda/config, readOnly: true }
```

The pod decrypts the values when it loads the ConfigMap, and again each time the ConfigMap changes.

## Value formats

| Written by you               | Written by `webda config encrypt` | Decrypted to     |
| ---------------------------- | --------------------------------- | ---------------- |
| `encrypt:<encrypter>:value`  | `crypt:<encrypter>:<data>`        | a `SecretString` |
| `sencrypt:<encrypter>:value` | `scrypt:<encrypter>:<data>`       | a plain `string` |
| `encrypt:value`              | `crypt:<default>:<data>`          | a `SecretString` |
| `sencrypt:value`             | `scrypt:<default>:<data>`         | a plain `string` |

A value still marked `encrypt:` when the application starts is passed as is, with a warning in the logs.

### Default encrypter

Set a default encrypter to drop the encrypter name from the values you write:

```jsonc title="webda.config.jsonc"
{
  "parameters": {
    "configurationEncryption": {
      // Encrypter used by `encrypt:<value>` and `sencrypt:<value>`
      "default": "pki"
    }
  }
}
```

```jsonc title="k8s/webda.jsonc"
{
  "services": {
    "db": { "password": "encrypt:my-db-password" }
  }
}
```

`webda config encrypt` always writes the encrypter in the encrypted value (`crypt:pki:...`): decrypting never
depends on the default, so you can change it later without breaking the existing values.

:::note Values starting with an encrypter name

When the first segment of `encrypt:<segment>:<rest>` is a registered encrypter name (`local`, `password`, `pki`...),
it is the encrypter, not part of the value: `encrypt:local:x` is encrypted by `local`. To encrypt a value that starts
with `local:`, name the encrypter explicitly: `encrypt:pki:local:x`. Any other first segment is part of the value:
`encrypt:a:b` encrypts `a:b` with the default encrypter.

:::

Without a default encrypter, `encrypt:<value>` fails with
`No default encrypter for the value at <path>, set parameters.configurationEncryption.default`.

### Encryption settings

`parameters.configurationEncryption` holds the default encrypter and the options of each encrypter. It sits in
`parameters`, so a deployment can override it, to use other keys in production for example. It cannot hold encrypted
values: the application fails with `CONFIGURATION_ENCRYPTION_INVALID` if one of them starts with `crypt:` or `scrypt:`.

```jsonc
{
  "parameters": {
    "configurationEncryption": {
      "default": "pki",
      "encrypters": {
        "pki": { "activeKey": "2026-10", "publicKeys": ".webda/keys", "privateKeys": "/etc/webda/pki" }
      }
    }
  }
}
```

### SecretString

`crypt:` values become a `SecretString` from `@webda/core`. It masks itself everywhere a value can leak:
`toString()`, template literals, `JSON.stringify` and `util.inspect` all return `********`. The plain value is
only available with `getValue()`.

The library services that hold secrets (database passwords and connection strings, cloud credentials, OAuth client
secrets, SMTP authentication, registry credentials...) accept a `SecretString`. Use `scrypt:` only for a third-party
module that requires a plain string.

## Encrypters

| Name       | Package          | Key                                                                       | Use it for                                     |
| ---------- | ---------------- | ------------------------------------------------------------------------- | ---------------------------------------------- |
| `local`    | `@webda/core`    | the machine id, or the `WEBDA_MACHINE_ID` variable                        | local development secrets, never shared        |
| `password` | `@webda/runtime` | a password, from `WEBDA_CONFIG_PASSWORD` or a prompt                      | small teams sharing a password out of band     |
| `gcp`      | `@webda/gcp`     | a Google Cloud KMS key, `WEBDA_GCP_KMS_KEY` to encrypt                    | production, access managed by IAM              |
| `pki`      | `@webda/core`    | RSA key pairs: public keys in the repository, private keys in the runtime | anyone encrypts, only the application decrypts |
| `none`     | `@webda/core`    | none, the value stays in clear text                                       | a secret field holding a public value          |

An encrypter is available once its package is a dependency of the application: the package registers it when the
application loads its modules.

- **local**: a value encrypted on one machine can only be decrypted on the same machine. Set the same
  `WEBDA_MACHINE_ID` on several machines (or in a container) to share it.
- **password**: the password is read from `WEBDA_CONFIG_PASSWORD`, otherwise asked once in the terminal. A server
  needs the environment variable.
- **gcp**: encrypting needs `WEBDA_GCP_KMS_KEY=projects/<project>/locations/<location>/keyRings/<ring>/cryptoKeys/<key>`
  and the `cloudkms.cryptoKeyVersions.useToEncrypt` permission. The key name is stored with the value, so decrypting
  only needs the `useToDecrypt` permission on the application identity.

- **pki**: see [below](#pki-encrypter).
- **none**: see [Keeping a value in clear text](#keeping-a-value-in-clear-text).

`local`, `password` and `pki` use AES-256-GCM: a wrong key, a wrong password or an altered value fails with an error,
it never produces a wrong secret.

The `self` encrypter of `CryptoService` relies on the keys in the Registry, which are only available once the services
are initialized: it cannot be used in the configuration.

## PKI encrypter

With `local` or `password`, whoever can add a secret also has the key that decrypts all of them. The `pki` encrypter
is asymmetric:

- the **public keys** are committed with the application: any developer or CI job can encrypt a value;
- the **private keys** only live in the runtime (a Kubernetes Secret mounted as files, or environment variables):
  only the running application can decrypt.

It uses Node.js `crypto` only: a random AES-256-GCM key encrypts the value, and RSA-OAEP-256 wraps that key with the
public key. The value records the id of its key (`kid`), authenticated with the data, so several keys can be used at
the same time and rotated.

```
crypt:pki:v1:<kid>:<base64(wrapped key)>:<base64(iv | tag | ciphertext)>
```

### Setup

1. Generate a key pair, RSA 4096 bits by default (3072 at least):

```bash
webda config pki generate --kid 2026-10
```

It writes the public key to `.webda/keys/2026-10.pub.pem`, to commit, and the private key to `./2026-10.pem`
(mode `0600`, `--out` to change it). The private key is never written in the public keys directory. Keep the private
keys out of git:

```gitignore title=".gitignore"
*.pem
!*.pub.pem
```

2. Configure the encrypter:

```jsonc title="webda.config.jsonc"
{
  "parameters": {
    "configurationEncryption": {
      "default": "pki",
      "encrypters": {
        "pki": {
          // Key used to encrypt the new values
          "activeKey": "2026-10"
        }
      }
    }
  }
}
```

3. Write `encrypt:<value>` values in the configuration source file and run
   `webda -d production config encrypt -f k8s/webda.jsonc`: only the public key is needed.

4. Store the private key in the runtime, then delete the local file (see [Kubernetes](#kubernetes)).

### Options

| Option        | Default                                             | Description                                                               |
| ------------- | --------------------------------------------------- | ------------------------------------------------------------------------- |
| `activeKey`   |                                                     | key id used to encrypt the new values                                     |
| `publicKeys`  | `.webda/keys`                                       | directory of the public keys `<kid>.pub.pem`, relative to the application |
| `privateKeys` | `WEBDA_PKI_PRIVATE_KEYS_DIR`, then `/etc/webda/pki` | directory of the private keys `<kid>.pem` or `<kid>`                      |

The keys are looked up in this order:

| Key                    | Sources, in priority order                                                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Public key `<kid>`     | `<publicKeys>/<kid>.pub.pem`, then derived from the private key if it is available                                                        |
| Private key `<kid>`    | `WEBDA_PKI_PRIVATE_KEY_<KID>` (PEM, kid uppercased, `-` and `.` replaced by `_`), then `<privateKeys>/<kid>.pem` or `<privateKeys>/<kid>` |
| Private key passphrase | `WEBDA_PKI_PASSPHRASE`, optional                                                                                                          |

Encrypting never needs a private key, decrypting never needs a public key. Only RSA keys of 3072 bits or more are
accepted.

### Kubernetes

Store the private keys in a Secret, one entry per key id, and mount it at `/etc/webda/pki`:

```bash
kubectl create secret generic webda-pki --from-file=2026-10.pem=./2026-10.pem
```

```yaml
apiVersion: v1
kind: Secret
metadata: { name: webda-pki }
type: Opaque
stringData:
  2026-10.pem: |
    -----BEGIN PRIVATE KEY-----
    ...
---
# Deployment pod spec
volumes:
  - name: webda-pki
    secret: { secretName: webda-pki, defaultMode: 0400 }
containers:
  - name: app
    volumeMounts:
      - { name: webda-pki, mountPath: /etc/webda/pki, readOnly: true }
```

The pod decrypts the values at startup. Without the Secret, it stops with the path and the key id, never the value:

```
Cannot decrypt the value at services.db.password with encrypter 'pki': No private key for kid '2026-10' (available: none in /etc/webda/pki)
```

### Rotating PKI keys

Two keys can be used at the same time, so a key can be retired without downtime:

1. Generate the new key: `webda config pki generate --kid 2027-04`, commit its public key.
2. Add the new private key to the Secret, next to the old one, and deploy.
3. Set `activeKey` to `2027-04`: the new values use it, the old ones still decrypt.
4. Re-encrypt the old values with the active key, where both private keys are available (a CI job with the Secret, or
   `kubectl exec` in a pod):

```bash
webda -d production config encrypt -f k8s/webda.jsonc --upgrade
```

`--upgrade` only re-encrypts the `pki` values whose key is not the active key.

5. Check that no value uses the old key anymore:

```bash
webda -d production config pki list -f k8s/webda.jsonc
```

```
Active key: 2027-04
Public keys in /app/.webda/keys: 2026-10, 2027-04
Values in /app/k8s/webda.jsonc:
  2026-10: 0
  2027-04 (active): 12
```

6. Remove the old private key from the Secret and its public key from the repository.

## Rotating and migrating

Re-encrypt every encrypted value with another encrypter, for example to move from `local` to `gcp` before deploying:

```bash
webda -d production config encrypt -f k8s/webda.jsonc --migrate gcp
```

Without a name, `--migrate` re-encrypts them with the [default encrypter](#default-encrypter).

Re-encrypt every encrypted value with its own encrypter, to its current format (values written by earlier versions use an
older unauthenticated format, still readable), or to the active key for `pki`:

```bash
webda -d production config encrypt -f k8s/webda.jsonc --upgrade
```

## Encrypting every secret field

`webda config encrypt` also encrypts the plain values of the secret fields, the ones marked `x-webda-secret` in the
compiled schemas (see [Using secrets in your services](#using-secrets-in-your-services)), with the
[default encrypter](#default-encrypter). A database password written in clear text is encrypted without adding
`encrypt:` first:

```jsonc title="webda.config.jsonc"
{
  "parameters": { "configurationEncryption": { "default": "gcp" } },
  "services": {
    "db": {
      "type": "PostgresStore",
      // `password` and `connectionString` are secret fields: encrypted, `host` is not
      "postgresqlServer": { "host": "db.example.com", "password": "my-db-password" }
    }
  }
}
```

Without a default encrypter, the command fails and lists the plain secrets: set one, or prefix them with
`encrypt:<encrypter>:`. Each auto-encrypted path is logged, never the value. Unset values (`""`, `null`) are left as
they are: the service then falls back to its environment.

It checks the services, the global `parameters` they inherit (including the services of another file: a deployment
`parameters` reaches the services of `webda.config`), and the deployment units with their `resources`. A service a
deployment overrides without its `type` takes the type of `webda.config`. A service type without schema, from a
package that is not a dependency of the application, is skipped with a warning.

### Keeping a value in clear text

A secret field sometimes holds a value that is not secret: a public demo key, a local development password. Write it
`crypt:none:<value>` (or `encrypt:none:<value>`, which `webda config encrypt` turns into `crypt:none:<value>`): it
stays in clear text, the service receives the value as is, and the opt-out is visible in the file.

```jsonc title="webda.config.jsonc"
        // Shared demo account, not a secret
        "password": "crypt:none:demo"
```

`webda config encrypt` never encrypts it, even with `--migrate`, and `--check` reports it as a warning without
failing. `scrypt:none:<value>` does the same for a field read as a plain string. The value must be a single line.

## Checking for unencrypted secrets

`webda config encrypt --check` writes nothing: it fails when a secret field is not encrypted, a plain value or a value
still marked `encrypt:` (encryption was forgotten). Run it in CI or in a pre-commit hook to catch a secret committed in
clear text before it leaks.

```bash
webda config encrypt --check
webda -d production config encrypt --check
```

```
✗ deployments/production.jsonc: services.db.postgresqlServer.password (Webda/PostgresStore): secret is not encrypted
✗ deployments/production.jsonc: units[aws].secretAccessKey (Webda/AWSDeployer): secret is marked encrypt: but not encrypted, run 'webda config encrypt'
! webda.config.jsonc: services.demo.password (Webda/PostgresStore): secret is kept in clear text on purpose (crypt:none:)
2 unencrypted secret(s) found, 1 kept in clear text on purpose
```

The exit code is `1` when a secret is not encrypted, `0` otherwise. Only the files and paths are reported, never the
values. It does not encrypt or decrypt anything, so it needs no key: no `WEBDA_CONFIG_PASSWORD`, no KMS access, no
private key.

- `-f <file>`: check this file instead of `webda.config` and the deployment file
- `--no-strict`: only warn for the values marked `encrypt:`
- `--format json`: write `{ "findings": [...], "warnings": [...] }` on the standard output, each entry with `file`,
  `path`, `service`, `type` and `reason` (`plain`, `marked` or `opted-out`)

```yaml title=".github/workflows/ci.yml"
- run: pnpm webda config encrypt --check
- run: |
    for d in deployments/*.json*; do
      pnpm webda -d "$(basename "${d%%.*}")" config encrypt --check
    done
```

## Errors

Decryption errors stop the application at startup, with the configuration path and the encrypter, never the value:

```
Cannot decrypt the value at services.db.postgresqlServer.password with encrypter 'local': Wrong key or altered data
Unknown encrypter 'gcp' at services.db.postgresqlServer.password (registered: local, password)
```

- `Wrong key or altered data`: `local` value from another machine, `pki` value with another key, or the file was modified.
- `No private key for kid`: the `pki` private key is not mounted or not in the environment.
- `Wrong password or altered data`: wrong `WEBDA_CONFIG_PASSWORD`.
- `Unknown encrypter`: the package providing it is not a dependency of the application.

## Using secrets in your services

Type a secret parameter as `string | SecretString` and read it with `SecretString.from`. It also accepts a plain
string, with a warning that does not contain the value. Its JSON schema stays a `string`, marked
`"x-webda-secret": true` so [`webda config encrypt`](#encrypting-every-secret-field) encrypts it, and `--check`
reports it when it is not encrypted.

```typescript
import { SecretString, Service, ServiceParameters } from "@webda/core";

export class MyServiceParameters extends ServiceParameters {
  /**
   * API key of the partner
   *
   * Can be encrypted with `webda config encrypt`
   */
  apiKey: string | SecretString;
}

export class MyService extends Service<MyServiceParameters> {
  async init(): Promise<this> {
    await super.init();
    this.client = new PartnerClient({ apiKey: SecretString.from(this.parameters.apiKey, "MyService.apiKey") });
    return this;
  }
}
```

To pass an option object that can hold secrets to a third-party client, use `SecretString.unwrap`: it returns a copy
with plain values, without warnings.

```typescript
const client = new pg.Client(SecretString.unwrap(this.parameters.postgresqlServer));
```

A field that holds secrets with another type, like a third-party options object, is marked with the `@secret` tag:

```typescript
export class MyServiceParameters extends ServiceParameters {
  /**
   * Options of the partner client, every string in it is a secret
   *
   * @secret
   */
  client?: any;
  /**
   * Connection settings, only these children are secrets
   *
   * @secret password,connectionString
   */
  postgresqlServer?: ClientConfig;
  /**
   * A kubeconfig file path, or its content: a name can be a path, arrays are traversed
   *
   * @secret users.token,users.password
   */
  config?: string | K8sConfiguration;
}
```

Without names, `@secret` marks the whole value: every string below it must be encrypted. With names, only those
children are secrets, and a plain string at the field itself (a file path) is fine. Start any prose after the tag with
`-`, or it reads as a name. On a class, `@secret` marks every property typed with it: that is how `SecretString` works,
so your own secret wrapper class tagged `@type string` and `@secret` is detected too.

## Custom encrypter

Register an encrypter as a side effect of a module your application loads, so it is available before the services
are created. `decrypt` must throw when the data cannot be decrypted, and `encrypt` must return a single-line string.

```typescript
import { CryptoService } from "@webda/core";

CryptoService.registerEncrypter("vault", {
  encrypt: async (data: string) => vault.encrypt("transit/webda", data),
  decrypt: async (data: string) => vault.decrypt("transit/webda", data)
});
```

Encrypter names use letters, digits, `_`, `-` and `.`.

An encrypter can also implement:

- `configure(options, context)`: receives `parameters.configurationEncryption.encrypters.<name>` (an empty object
  when not set) and `{ appPath, mode }` before its first use in a configuration;
- `needsUpgrade(data)`: returns `false` for a value that `--upgrade` does not need to re-encrypt.

## API

- `CryptoService.registerEncrypter(name, encrypter)` and `CryptoService.getEncrypter(name)`
- `CryptoService.encryptConfiguration(data, { migrate, upgrade, settings, appPath })`: encrypts the marked values, in place
- `CryptoService.decryptConfiguration(data, path, { settings, appPath })`: returns a decrypted copy
- `parseEncryptedValue(value, defaultEncrypter)`: parses a configuration value
- `findUnencryptedSecrets(value, schema)` and `findConfigurationSecrets(configuration, options)`: find the unencrypted
  secret fields, without the values
- `PkiKeyring`, `PkiEncrypter`: the `pki` keys and encrypter
- `SecretString.from(value, path)`, `SecretString.unwrap(value)`, `secret.getValue()`
