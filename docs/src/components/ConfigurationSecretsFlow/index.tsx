import React from "react";
import DiagramFigure from "../DiagramFigure";

export default function ConfigurationSecretsFlow() {
  return (
    <DiagramFigure
      src="/img/concepts/configuration-secrets.svg"
      width={1200}
      height={880}
      label="Configuration secrets deployment"
      alt="Public keys and encrypted configuration are committed to Git. Developers or CI encrypt with public keys. Kubernetes mounts the encrypted ConfigMap and separately supplies private keys from a runtime Secret. The application decrypts configuration before services use it. Local plaintext configuration stays gitignored."
    >
      This example uses the PKI encrypter. Production private keys are provisioned separately from the repository.
    </DiagramFigure>
  );
}
