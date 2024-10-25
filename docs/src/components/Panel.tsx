import React from "react";
import SvgWebdaPart from "./WebdaJigsaw";

export const WebdaColors = {
  ORANGE: "#FF9901",
  BLUE: "#3F51B5",
  GREEN: "#7EBF6A",
  WHITE: "#FFFFFF",
  STROKE: "#29ABE2"
};

export default function WebdaPanel({
  color,
  corner,
  title,
  children,
  iconSize = 96,
  ...options
}: React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement> & {
  color?: keyof typeof WebdaColors;
  corner?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  title?: string;
  iconSize?: number;
}) {
  corner ??= "bottom-left";
  options ??= {};
  options.style ??= {};
  options.style.padding ??= "10px";
  options.style.margin ??= "10px";
  options.style.height ??= "200px";
  options.style.width ??= "320px";
  options.style.border = "1px solid black";
  options.style.borderRadius = "5px";
  color ??= "BLUE";
  if (corner === "top-left") {
    options.style.transform = "scale(1, -1)";
  } else if (corner === "top-right") {
    options.style.transform = "scale(-1, -1)";
  } else if (corner === "bottom-right") {
    options.style.transform = "scale(-1, 1)";
  }
  return (
    <div {...options}>
      <SvgWebdaPart
        fillColor={WebdaColors[color]}
        strokeColor={WebdaColors.STROKE}
        width={iconSize}
        height={iconSize}
        style={{ position: "relative", top: 0, right: 0 }}
      />
      <h3>{title}</h3>
      {children}
    </div>
  );
}
