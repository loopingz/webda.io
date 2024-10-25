import React from "react";
import CodeBlock from "@theme-original/CodeBlock";
import type CodeBlockType from "@theme/CodeBlock";
import type { WrapperProps } from "@docusaurus/types";
import WebdaJigsaw from "@site/src/components/WebdaJigsaw";
import { WebdaColors } from "@site/src/components/WebdaPanel";

type Props = WrapperProps<typeof CodeBlockType>;

export default function CodeBlockWrapper(props: Props): JSX.Element {
  let color;
  if (props.metastring?.includes("color=")) {
    const colorStr = props.metastring.split("color=")[1].split(" ")[0].replace(/"/g, "") as keyof typeof WebdaColors;
    color = WebdaColors[colorStr.toUpperCase()] || WebdaColors.BLUE;
  } else {
    if (props.metastring?.includes("title")) {
      const title = props.metastring.split("title=")[1].split(" ")[0].replace(/"/g, "") as keyof typeof WebdaColors;
      if (title.match(/\.jsonc?$/) || title.includes("deployments")) {
        color = WebdaColors.ORANGE;
      }
    }
    if (props.className === "language-shell" || props.className === "language-bash") {
      color = "#555";
    }
  }
  if (!color && typeof props.children === "string") {
    if (props.children.includes("Service")) {
      color = WebdaColors.GREEN;
    }
  }
  color ??= WebdaColors.BLUE;
  console.log("Props", props);
  return (
    <>
      <CodeBlock {...props} />
      <div style={{ display: "flex", justifyContent: "end", marginTop: -40, marginRight: -10 }}>
        <WebdaJigsaw fillColor={color} style={{ transform: "scale(-1, 1)", width: "32" }} />
      </div>
    </>
  );
}
