import React from "react";
import DiagramFigure from "../DiagramFigure";

export default function ConfigurationFlow() {
  return (
    <DiagramFigure
      src="/img/concepts/configuration-service.svg"
      width={1200}
      height={850}
      label="Dynamic configuration flow"
      alt="Provider notifications or a polling interval trigger a refresh. ConfigurationService reads and merges sources in order, then compares the result with the previous configuration. Unchanged values wait for the next refresh. Changed values are decrypted and passed to Core, which loads changed service parameters while preserving service types."
    >
      Both refresh modes use the same comparison and update pipeline. Polling is enabled when any source cannot notify.
    </DiagramFigure>
  );
}
