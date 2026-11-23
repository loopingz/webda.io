import React from "react";
import DiagramFigure from "../DiagramFigure";

export default function ServiceLifecycle() {
  return (
    <DiagramFigure
      src="/img/concepts/service-lifecycle.svg"
      width={1200}
      height={820}
      label="Service lifecycle diagram"
      alt="One service instance follows six steps: configuration supplies parameters; the constructor creates the instance synchronously; resolve synchronously injects dependencies and wires references; init asynchronously opens resources; running handles requests or background work; stop asynchronously releases resources. No asynchronous work in the constructor or resolve. Core stops services concurrently."
    >
      One service instance, managed by Core. The steps show execution order, not duration.
    </DiagramFigure>
  );
}
