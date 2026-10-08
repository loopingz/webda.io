/**
 * GA4 for the documentation pages, with Consent Mode v2.
 *
 * Not the stock plugin-google-gtag: the loader is emitted here so that
 * - the consent defaults precede `gtag('config')`,
 * - `page_location` never carries a query string or a fragment (the shared
 *   helper in ./page-location.js is used by the head script and the client module),
 * - nothing is emitted at all without a measurement id.
 *
 * The hosted debug dashboard (/debug/) is a static page outside Docusaurus and
 * gets none of this; its usage events go through a sandboxed iframe.
 *
 * @param {import('@docusaurus/types').LoadContext} _context - the site context
 * @param {{ measurementId?: string }} options - the GA4 measurement id, when analytics are enabled
 * @returns {import('@docusaurus/types').Plugin} the plugin
 */
module.exports = function analyticsPlugin(_context, options) {
  const measurementId = options && options.measurementId;
  const enabled = !!measurementId && process.env.NODE_ENV === "production";
  return {
    name: "webda-analytics",
    getClientModules() {
      return enabled ? ["./gtag-client.js"] : [];
    },
    injectHtmlTags() {
      if (!enabled) return {};
      const id = JSON.stringify(measurementId);
      return {
        headTags: [
          { tagName: "link", attributes: { rel: "preconnect", href: "https://www.googletagmanager.com" } },
          {
            tagName: "script",
            innerHTML: `
(function () {
  window.dataLayer = window.dataLayer || [];
  function gtag() { dataLayer.push(arguments); }
  window.gtag = gtag;
  var consent = null;
  try { consent = localStorage.getItem("webda.consent"); } catch (e) {}
  gtag("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: consent === "granted" ? "granted" : "denied",
    wait_for_update: 500
  });
  gtag("js", new Date());
  gtag("config", ${id}, {
    anonymize_ip: true,
    page_location: location.origin + location.pathname,
    page_referrer: ""
  });
})();`
          },
          {
            tagName: "script",
            attributes: {
              async: true,
              src: `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`
            }
          }
        ]
      };
    }
  };
};
