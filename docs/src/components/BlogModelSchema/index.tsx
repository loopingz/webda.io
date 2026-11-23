import React from "react";
import DiagramFigure from "../DiagramFigure";

export default function BlogModelSchema() {
  return (
    <DiagramFigure
      src="/img/tutorials/blog-model-schema.svg"
      width={1080}
      height={900}
      label="Blog model relationship diagram"
      alt="User authors many Posts and Comments; Post has many Comments. Post and Tag connect through PostTag. UserFollow links the follower and following roles back to User. 1 means one and N means many; these are relationships, not inheritance."
    >
      Join models connect posts to tags and users to other users.
    </DiagramFigure>
  );
}
