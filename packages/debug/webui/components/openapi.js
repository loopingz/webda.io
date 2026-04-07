import { h } from "https://esm.sh/preact@10.25.4";
import { useEffect, useRef } from "https://esm.sh/preact@10.25.4/hooks";
import htm from "https://esm.sh/htm@3.1.1";

const html = htm.bind(h);

export function OpenAPIPanel() {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Dynamically load Swagger UI
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css";
    document.head.appendChild(link);

    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js";
    script.onload = () => {
      if (window.SwaggerUIBundle && containerRef.current) {
        window.SwaggerUIBundle({
          url: "/api/openapi",
          domNode: containerRef.current,
          presets: [window.SwaggerUIBundle.presets.apis],
          layout: "BaseLayout",
          deepLinking: false,
          defaultModelsExpandDepth: 1,
          defaultModelExpandDepth: 1
        });
      }
    };
    document.head.appendChild(script);

    return () => {
      document.head.removeChild(link);
      document.head.removeChild(script);
    };
  }, []);

  return html`
    <div class="swagger-container">
      <div ref=${containerRef} style="height: 100%; overflow: auto; background: #fff; border-radius: 4px; padding: 1rem;"></div>
    </div>
  `;
}
