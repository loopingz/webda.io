import React from "react";
import DiagramFigure from "../DiagramFigure";
import diagrams from "./manifest.json";

export default function ReferenceDiagram({ id }: { id: keyof typeof diagrams }) {
  const diagram = diagrams[id];
  return (
    <DiagramFigure
      src={`/img/concepts/${id}.svg`}
      width={1200}
      height={diagram.height}
      label={diagram.title}
      alt={diagram.alt}
    >
      {diagram.caption}
    </DiagramFigure>
  );
}
