/**
 * The page location reported to analytics: origin and path only, never the
 * query string (`?port=`) nor the fragment (`#token=`).
 *
 * @param {{ origin: string, pathname: string }} location - a Location-like object
 * @returns {string} the cleaned URL
 */
function cleanPageLocation(location) {
  return location.origin + location.pathname;
}

module.exports = { cleanPageLocation };
