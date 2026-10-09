/**
 * Client module of the analytics plugin: a page_view on every client-side
 * navigation, with the cleaned location (no query, no fragment).
 */
const { cleanPageLocation } = require("./page-location");

module.exports = {
  onRouteDidUpdate({ location, previousLocation }) {
    if (!previousLocation || location.pathname === previousLocation.pathname) return;
    setTimeout(() => {
      if (typeof window.gtag !== "function") return;
      window.gtag("event", "page_view", {
        page_location: cleanPageLocation(window.location),
        page_path: location.pathname,
        page_referrer: ""
      });
    });
  }
};
