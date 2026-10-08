/**
 * Consent Mode v2 defaults and debug-session hygiene, injected in <head>
 * BEFORE the Google tag (this plugin is listed before plugin-google-gtag in
 * docusaurus.config.ts, and plugin head tags are emitted in that order).
 *
 * The inline script:
 * 1. moves the `#token=…&telemetry=0` fragment that `webda debug --web` puts in
 *    the dashboard URL into sessionStorage and removes it from the URL, so no
 *    page_location ever carries the token;
 * 2. disables the Google tag for the whole session when telemetry is opted out
 *    (`window["ga-disable-<id>"]`);
 * 3. pushes the consent defaults: everything denied, analytics_storage granted
 *    only when the visitor already accepted the banner.
 *
 * @param {import('@docusaurus/types').LoadContext} _context - the site context
 * @param {{ measurementId?: string }} options - the GA4 measurement id, when analytics are enabled
 * @returns {import('@docusaurus/types').Plugin} the plugin
 */
module.exports = function analyticsConsentPlugin(_context, options) {
  const measurementId = options && options.measurementId;
  return {
    name: "webda-analytics-consent",
    injectHtmlTags() {
      if (!measurementId) return {};
      const script = `
(function () {
  var id = ${JSON.stringify(measurementId)};
  window.dataLayer = window.dataLayer || [];
  function gtag() { dataLayer.push(arguments); }
  try {
    var hash = location.hash;
    if (hash && /(^#|&)(token|telemetry)=/.test(hash)) {
      var params = new URLSearchParams(hash.substring(1));
      var token = params.get("token");
      if (token) sessionStorage.setItem("webda.debug.token", token);
      if (params.get("telemetry") === "0") sessionStorage.setItem("webda.debug.telemetry", "0");
      var port = new URLSearchParams(location.search).get("port");
      if (port && /^[0-9]+$/.test(port)) localStorage.setItem("webda.debug.port", port);
      history.replaceState(null, "", location.pathname + location.search);
    }
  } catch (e) {}
  try {
    if (sessionStorage.getItem("webda.debug.telemetry") === "0") window["ga-disable-" + id] = true;
  } catch (e) {}
  var consent = null;
  try { consent = localStorage.getItem("webda.consent"); } catch (e) {}
  gtag("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: consent === "granted" ? "granted" : "denied",
    wait_for_update: 500
  });
})();`;
      return {
        headTags: [{ tagName: "script", innerHTML: script }]
      };
    }
  };
};
