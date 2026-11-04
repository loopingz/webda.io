# CryptoService

This provides basic encryption and decryption services.

## Keys

The CryptoService keeps a set of keys per key id: an asymmetric key pair (JWT `RS*`/`PS*`/`ES*`, JWKS) and a symmetric
key (`encrypt`/`decrypt`, `hmac`, JWT `HS*`). The `current` key encrypts and signs, the other keys still decrypt and
verify the data and tokens they produced.

By default the keys are stored in the Registry: `autoCreate` creates the first set and `rotate()` adds a new one.

### Keys file

When the Registry lives in the same database as the data the keys protect, a database dump contains both the
ciphertext and the keys. Read the keys from a file instead, typically a mounted Kubernetes secret:

```json
{
  "services": {
    "CryptoService": {
      "type": "Webda/CryptoService",
      "keysFile": "/etc/webda/crypto/keys.json"
    }
  }
}
```

A relative path is resolved against the application path. The file has the shape of the Registry entry:

```json
{
  "current": "k2",
  "key_k1": {
    "publicKey": "-----BEGIN PUBLIC KEY-----...",
    "privateKey": "-----BEGIN PRIVATE KEY-----...",
    "symetric": "<base64>"
  },
  "key_k2": { "publicKey": "...", "privateKey": "...", "symetric": "..." }
}
```

With `keysFile`:

- the Registry is never read nor written, `autoCreate` and `autoRotate` are ignored
- a missing or invalid file fails the service initialization
- the file is checked for changes (modification time, size, inode) before each encryption, signature or key lookup,
  and reloaded when it changed: a secret update is picked up without restart. A broken update is logged and the
  previous keys are kept
- `rotate()` fails: rotate by adding a `key_<id>` to the file and switching `current` to it. Keep the previous keys as
  long as data encrypted or tokens signed with them must stay valid; removing a key makes them unreadable

Generate a file with the default algorithms (RSA 2048 bits, 256 bits symmetric key), then store it as a secret:

```bash
webda crypto generate-keys keys.json
kubectl create secret generic webda-crypto-keys --from-file=keys.json=keys.json
rm keys.json
```

The command never overwrites an existing file and writes it readable by its owner only. To rotate, generate a new
file and merge its `key_<id>` entry and `current` into the existing secret.

## Configuration encryption

CryptoService also holds the encrypters used for the configuration secrets (`CryptoService.registerEncrypter`) and the
`webda config encrypt` command (`--check` to only check that the secrets are encrypted). See [Configuration Secrets](../../Security/ConfigurationSecrets.md).
