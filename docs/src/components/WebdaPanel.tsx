import React from "react";
import { useMediaQuery } from "react-responsive";
import WebdaJigsaw from "./WebdaJigsaw";

export const WebdaColors = {
  ORANGE: "#FF9901",
  BLUE: "#3F51B5",
  GREEN: "#7EBF6A",
  WHITE: "#F4F4F4",
  STROKE: "#29ABE2"
};

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h,
    s,
    l = (max + min) / 2;

  if (max === min) {
    h = s = 0; // achromatic
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return { h, s, l }; // Return an object with h, s, l properties
}

function hslToRgb(hslColor) {
  // Accept an object with h, s, l properties
  let { h, s, l } = hslColor;
  let r, g, b;

  if (s === 0) {
    r = g = b = l; // achromatic
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  }; // Return an object with r, g, b properties
}
function hexToRgb(hex) {
  // Remove the '#' if present
  hex = hex.replace("#", "");

  // Extract the red, green, and blue components
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  return { r, g, b };
}

function rgbToHex(rgbColor): string {
  const r = rgbColor.r.toString(16).padStart(2, "0");
  const g = rgbColor.g.toString(16).padStart(2, "0");
  const b = rgbColor.b.toString(16).padStart(2, "0");
  return `#${r}${g}${b}`;
}

function adjustLightness(hexColor, amount): string {
  const rgbColor = hexToRgb(hexColor); // Convert hex to RGB
  const hslColor = rgbToHsl(rgbColor.r, rgbColor.g, rgbColor.b);
  hslColor.l += amount;
  hslColor.l = Math.max(0, Math.min(1, hslColor.l));
  const adjustedRgb = hslToRgb(hslColor);
  return rgbToHex(adjustedRgb); // Convert back to hex
}

function Subpanel({
  color,
  children,
  title,
  style
}: {
  title: string;
  color: keyof typeof WebdaColors;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const panelStyle: React.CSSProperties = {
    padding: 10,
    backgroundColor: color === "WHITE" ? "#F8F8F8" : adjustLightness(WebdaColors[color], 0.3),
    minHeight: 250,
    minWidth: 250,
    width: "50%",
    height: "50%",
    ...style
  };

  return (
    <div style={{ ...panelStyle }}>
      <h3 style={{ color: adjustLightness(WebdaColors[color], -0.2) }}>{title}</h3>
      {children}
    </div>
  );
}

export default function WebdaPanel({
  color,
  ...options
}: React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement> & {
  color?: keyof typeof WebdaColors;
  title?: string;
  iconSize?: number;
}) {
  options ??= {};
  options.style ??= {};
  options.style.padding ??= "10px";
  options.style.margin ??= "10px";
  options.style.height ??= "200px";
  options.style.width ??= "320px";
  options.style.border = "1px solid black";
  options.style.borderRadius = "5px";
  color ??= "BLUE";
  const isBigScreen = useMediaQuery({ query: "(min-width: 600px)" });
  if (!isBigScreen) {
    const style = {
      width: "100%",
      marginTop: 20,
      borderRadius: 10
    };
    return (
      <div>
        <Subpanel color="BLUE" title="Models" style={style}>
          Blah blah
        </Subpanel>
        <div style={{ display: "flex", justifyContent: "end", marginTop: -60, marginRight: -10 }}>
          <WebdaJigsaw fillColor={WebdaColors.BLUE} style={{ transform: "scale(-1, 1)", width: "96" }} />
        </div>
        <Subpanel color="GREEN" title="Services" style={style}>
          Blah blah
        </Subpanel>
        <div style={{ display: "flex", justifyContent: "end", marginTop: -60, marginRight: -10 }}>
          <WebdaJigsaw fillColor={WebdaColors.GREEN} style={{ transform: "scale(-1, 1)", width: "96" }} />
        </div>

        <Subpanel color="ORANGE" title="Deployments" style={style}>
          Blah blah
        </Subpanel>
        <div style={{ display: "flex", justifyContent: "end", marginTop: -60, marginRight: -10 }}>
          <WebdaJigsaw fillColor={WebdaColors.ORANGE} style={{ transform: "scale(-1, 1)", width: "96" }} />
        </div>
        <Subpanel color="WHITE" title="..." style={style}>
          Blah blah
        </Subpanel>
        <div style={{ display: "flex", justifyContent: "end", marginTop: -60, marginRight: -10 }}>
          <WebdaJigsaw
            fillColor={adjustLightness(WebdaColors.WHITE, -0.1)}
            style={{ transform: "scale(-1, 1)", width: "96" }}
          />
        </div>
      </div>
    );
  }
  const panelStyle: React.CSSProperties = {
    padding: 10,
    minHeight: 250,
    minWidth: 250,
    width: "50%",
    height: "50%"
  };
  return (
    <div style={{ margin: 20 }}>
      <img
        src="/img/webda.svg"
        alt="Webda Logo"
        width="200px"
        style={{ position: "relative", left: "calc(50% - 100px", bottom: -160 }}
      />
      <div style={{ display: "flex", marginTop: -200 }}>
        <Subpanel color="BLUE" title="Models" style={{ ...panelStyle, borderBottomWidth: 1, borderTopLeftRadius: 10 }}>
          Blah blah
        </Subpanel>
        <Subpanel
          color="ORANGE"
          title="Deployments"
          style={{ ...panelStyle, borderBottomWidth: 1, borderTopRightRadius: 10 }}
        >
          Blah blah
        </Subpanel>
      </div>
      <div style={{ display: "flex" }}>
        <Subpanel
          color="GREEN"
          title="Services"
          style={{ ...panelStyle, borderBottomWidth: 1, borderBottomLeftRadius: 10 }}
        >
          Blah blah
        </Subpanel>
        <Subpanel
          color="WHITE"
          title="..."
          style={{ ...panelStyle, borderBottomWidth: 1, borderBottomRightRadius: 10 }}
        >
          Blah blah
        </Subpanel>
      </div>
    </div>
  );
}
