// Analytics relay, running in the sandboxed (opaque origin) iframe of the hosted dashboard.
import { isSandboxedFrame, validateAnalyticsMessage } from "../src/analytics-allowlist.js";

type Gtag = (...args: unknown[]) => void;

/**
 * Load gtag with Consent Mode v2 defaults and the parent's consent choice.
 *
 * Everything that may throw in an opaque origin (cookies, storage) is wrapped:
 * losing analytics is fine, the sandbox is never relaxed.
 *
 * @param id - GA4 measurement id
 * @param consent - the docs site's choice for analytics_storage
 * @returns the gtag function
 */
function loadGtag(id: string, consent: "granted" | "denied"): Gtag {
  const w = window as unknown as { dataLayer?: unknown[]; gtag?: Gtag };
  w.dataLayer = w.dataLayer || [];
  const gtag: Gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    w.dataLayer!.push(arguments);
  };
  w.gtag = gtag;
  gtag("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: consent
  });
  gtag("js", new Date());
  gtag("config", id, {
    anonymize_ip: true,
    send_page_view: false,
    page_location: "https://webda.io/debug/",
    page_referrer: ""
  });
  try {
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    script.onerror = () => {
      /* blocked or offline: silent */
    };
    document.head.appendChild(script);
  } catch {
    // silent
  }
  return gtag;
}

// The measurement id is written here by docs/sync-debug-ui.js at build time; the
// placeholder never matches the id pattern, so nothing runs without it.
const id = "__WEBDA_GA_ID__";
const params = new URLSearchParams(location.search);
const consent = params.get("consent") === "granted" ? "granted" : "denied";
const parentOrigin = new URL(location.href).origin;

// Only inside the sandboxed iframe of the dashboard: opaque origin and framed
if (isSandboxedFrame({ origin: self.origin, parent: window.parent, self: window }) && /^G-[A-Z0-9]+$/.test(id)) {
  const gtag = loadGtag(id, consent);
  window.addEventListener("message", evt => {
    // Only the page that embeds this relay (same origin as this document's URL) may post
    if (evt.origin !== parentOrigin || evt.source !== window.parent) return;
    const message = validateAnalyticsMessage(evt.data);
    if (!message) return;
    try {
      gtag("event", message.event, message.params);
    } catch {
      // silent
    }
  });
}
