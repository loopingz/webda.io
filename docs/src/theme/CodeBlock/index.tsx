import React from "react";
import CodeBlock from "@theme-original/CodeBlock";
import type CodeBlockType from "@theme/CodeBlock";
import type { WrapperProps } from "@docusaurus/types";

import WebdaJigsaw from "@site/src/components/WebdaJigsaw";
import { WebdaColors } from "@site/src/components/WebdaPanel";

type Props = WrapperProps<typeof CodeBlockType>;

/** Keep Docusaurus highlighting/copy controls, with a language label and optional folding. */
export default function CodeBlockWrapper(props: Props) {
  const language = props.language || props.className?.replace(/^language-/, "") || "text";
  const lines = typeof props.children === "string" ? props.children.trimEnd().split("\n").length : 0;
  const explicitColor = props.metastring?.match(/color=["']?([a-z]+)/i)?.[1]?.toUpperCase();
  const color =
    (explicitColor && WebdaColors[explicitColor as keyof typeof WebdaColors]) ||
    (language === "json" || language === "jsonc"
      ? WebdaColors.ORANGE
      : typeof props.children === "string" && props.children.includes("Service")
        ? WebdaColors.GREEN
        : WebdaColors.BLUE);
  const block = (
    <div className="docs-code-example">
      <div className="docs-code-language">
        <span>{language}</span>
      </div>
      <CodeBlock {...props} {...(language === "jsonc" ? { language: "json", className: "language-json" } : {})} />
      <span className="docs-code-jigsaw" aria-hidden="true">
        <WebdaJigsaw fillColor={color} />
      </span>
    </div>
  );
  return lines > 35 ? (
    <details className="docs-code-details">
      <summary>
        <b className="docs-code-show">Show example</b>
        <b className="docs-code-hide">Hide example</b>{" "}
        <span>
          {language} · {lines} lines
        </span>
      </summary>
      {block}
    </details>
  ) : (
    block
  );
}
