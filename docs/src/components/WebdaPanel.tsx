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
    color: adjustLightness(WebdaColors[color], -0.4),
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

function ModelsPanel({ style }) {
  return (
    <Subpanel color="BLUE" title="Models" style={style}>
      They define your data and the way it is accessed. Permissions, actions, and what are their relations between each
      others. It is easier to unit tests your applications by unit testing your models.
    </Subpanel>
  );
}

function ServicesPanel({ style }) {
  return (
    <Subpanel color="GREEN" title="Services" style={style}>
      They implement behavior that are unrelated to models. Like authentication, database, queues, pub/sub. You can also
      add security system like Hawk protocol.
    </Subpanel>
  );
}

function OthersPanel({ style }) {
  return (
    <Subpanel color="WHITE" title="Integrations" style={style}>
      Your application can use REST or GraphQL or any other entrypoint. The Operations concept helps you have a
      normalized way to interact with your application.
    </Subpanel>
  );
}

function DeploymentsPanel({ style }) {
  return (
    <Subpanel color="ORANGE" title="Deployments" style={style}>
      Webda helps you to deploy as Kubernetes deployments, Lambda functions, or others. It has facilitator to read from
      ConfigMap.
    </Subpanel>
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
        <ModelsPanel style={style} />
        <div style={{ display: "flex", justifyContent: "end", marginTop: -60, marginRight: -10 }}>
          <WebdaJigsaw fillColor={WebdaColors.BLUE} style={{ transform: "scale(-1, 1)", width: "96" }} />
        </div>
        <ServicesPanel style={style} />
        <div style={{ display: "flex", justifyContent: "end", marginTop: -60, marginRight: -10 }}>
          <WebdaJigsaw fillColor={WebdaColors.GREEN} style={{ transform: "scale(-1, 1)", width: "96" }} />
        </div>

        <DeploymentsPanel style={style} />
        <div style={{ display: "flex", justifyContent: "end", marginTop: -60, marginRight: -10 }}>
          <WebdaJigsaw fillColor={WebdaColors.ORANGE} style={{ transform: "scale(-1, 1)", width: "96" }} />
        </div>
        <OthersPanel style={style} />
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
    height: "50%",
    display: "flex",
    flexDirection: "column"
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
        <ModelsPanel style={{ ...panelStyle, borderBottomWidth: 1, borderTopLeftRadius: 10 }} />
        <DeploymentsPanel
          style={{
            ...panelStyle,
            borderBottomWidth: 1,
            borderTopRightRadius: 10,
            display: "flex",
            flexDirection: "column",
            alignItems: "end",
            paddingBottom: 100
          }}
        />
      </div>
      <div style={{ display: "flex" }}>
        <ServicesPanel
          style={{
            ...panelStyle,
            borderBottomWidth: 1,
            borderBottomLeftRadius: 10,
            flexDirection: "column-reverse",
            paddingTop: 100
          }}
        />
        <OthersPanel
          style={{
            ...panelStyle,
            borderBottomWidth: 1,
            borderBottomRightRadius: 10,
            paddingTop: 100,
            flexDirection: "column-reverse",
            alignItems: "end"
          }}
        />
      </div>
    </div>
  );
}
