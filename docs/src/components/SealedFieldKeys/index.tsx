import React from "react";
import DiagramFigure from "../DiagramFigure";

export default function SealedFieldKeys() {
  return (
    <DiagramFigure
      src="/img/concepts/sealed-field-keys.svg"
      width={1200}
      height={1040}
      label="Sealed field key hierarchy"
      alt="Password, recovery and device key-encryption keys wrap the same random keyring key on the client. That key encrypts the private-key keyring. The server stores public keys and encrypted blobs. Public keys seal field envelopes; an unlocked recipient device uses its private key and matching associated data to open them."
    >
      KEK means key-encryption key. The diagram summarizes key ownership; the exact algorithms, associated data,
      recovery behavior and threat model are detailed below.
    </DiagramFigure>
  );
}
