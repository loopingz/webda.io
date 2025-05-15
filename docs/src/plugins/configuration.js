module.exports = function (context, options) {
  // ...
  return {
    name: "webda-configuration",

    async loadContent() {},
    async contentLoaded({ content, actions }) {
      const { addRoute } = actions;
      addRoute({
        path: "/configuration",
        component: "@site/src/components/Configuration",
        exact: false
      });
      addRoute({
        path: "/configuration",
        component: "@site/src/components/Configuration",
        exact: true
      });
      /* ... */
    }
    /* other lifecycle API */
  };
};
