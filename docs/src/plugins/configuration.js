/**
 * Keeps the historical `/configuration/*` URLs of the debug panels working:
 * they all redirect to the dashboard at `/debug/`.
 *
 * @returns {import('@docusaurus/types').Plugin} the plugin
 */
module.exports = function configurationRedirectPlugin() {
  return {
    name: "webda-configuration",
    async contentLoaded({ actions }) {
      const { addRoute } = actions;
      addRoute({
        path: "/configuration",
        component: "@site/src/components/ConfigurationRedirect",
        exact: false
      });
    }
  };
};
