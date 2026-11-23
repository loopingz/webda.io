import React from "react";
import DiagramFigure from "../DiagramFigure";

export default function ServiceEvents() {
  return (
    <DiagramFigure
      src="/img/concepts/service-events.svg"
      width={1200}
      height={820}
      label="Asynchronous service event flow"
      alt="AsyncEvents binds a queue-send listener to a service and stores the original callback. The service emits an event, AsyncEvents sends it to a queue, and a worker consumes and revives it before calling the registered callbacks. Awaiting emit waits for enqueueing, not for worker callback completion."
    >
      Register once, then deliver events through the queue. The worker runs the original callbacks separately from the
      emitter.
    </DiagramFigure>
  );
}
