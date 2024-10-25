// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

const lightCodeTheme = require("prism-react-renderer").themes.github;
const darkCodeTheme = require("prism-react-renderer").themes.dracula;

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: "Webda.io",
  tagline: "Focus on your business, not on the basics of an application. Deploy everywhere",
  favicon: "img/favicon.ico",
  // Set the production url of your site here
  url: "https://webda.io",
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: "/",

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: "loopingz", // Usually your GitHub org/user name.
  projectName: "webda.io", // Usually your repo name.

  onBrokenLinks: "throw",
  onBrokenMarkdownLinks: "warn",
  markdown: {
    mermaid: true
  },
  // Even if you don't use internalization, you can use this field to set useful
  // metadata like html lang. For example, if your site is Chinese, you may want
  // to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: "en",
    locales: ["en"]
  },
  plugins: [
    [
      "@docusaurus/plugin-content-docs",
      {
        id: "contribute",
        path: "contribute",
        routeBasePath: "contribute",
        sidebarPath: "./sidebarsContribute.js"
        // ... other options
      }
    ],
    [
      "@docusaurus/plugin-content-docs",
      {
        id: "typedoc",
        path: "typedoc",
        routeBasePath: "typedoc",
        sidebarPath: "./sidebarsTypedoc.js"
        // ... other options
      }
    ]
  ],

  themes: ["@docusaurus/theme-mermaid"],
  presets: [
    [
      "classic",
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: require.resolve("./sidebars.js"),
          path: "./pages",
          editUrl: "https://github.com/loopingz/webda.io/tree/docs/"
        },
        blog: {
          showReadingTime: true,
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl: "https://github.com/loopingz/webda.io/tree/docs/"
        },
        theme: {}
      })
    ]
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      // Replace with your project's social card
      image: "img/docusaurus-social-card.jpg",
      metadata: [
        { name: "keywords", content: "webda, typescript, framework" },
        { name: "twitter:card", content: "summary_large_image" }
      ],
      navbar: {
        title: "Webda.io",
        logo: {
          alt: "Webda.io Logo",
          src: "img/webda.svg"
        },
        items: [
          {
            to: "/docs/QuickStart",
            activeBasePath: "pages",
            label: "Quick Start",
            position: "left"
          },
          {
            to: "/docs/Concepts",
            activeBasePath: "pages",
            label: "Concepts",
            position: "left"
          },
          {
            to: "typedoc/core/", // 'api' is the 'out' directory
            activeBasePath: "typedoc",
            label: "Typedoc",
            position: "left"
          },
          {
            to: "/contribute/Contribute",
            activeBasePath: "contribute",
            label: "Contribute",
            position: "right"
          },
          {
            href: "https://github.com/loopingz/webda.io",
            label: "GitHub",
            position: "right"
          }
        ]
      },
      footer: {
        style: "dark",
        links: [
          {
            title: "Docs",
            items: []
          },
          {
            title: "Sponsors",
            items: [
              {
                label: "Loopingz",
                href: "https://www.loopingz.com"
              },
              {
                label: "Arize AI",
                href: "https://www.arize.com"
              },
              {
                label: "Tellae",
                href: "https://www.tellae.fr"
              }
            ]
          }
        ],
        copyright: `Copyright © ${new Date().getFullYear()} Webda.io. Built with Docusaurus.`
      },
      prism: {
        theme: lightCodeTheme,
        darkTheme: darkCodeTheme
      },
      // ...
      algolia: {
        // The application ID provided by Algolia
        appId: "UJ1RRJDCSY",

        // Public API key: it is safe to commit it
        apiKey: "c0fea4c80336aa19ac28d1af6a507845",

        indexName: "webda",
        insights: true,

        // Optional: see doc section below
        contextualSearch: true,

        // Optional: Specify domains where the navigation should occur through window.location instead on history.push. Useful when our Algolia config crawls multiple documentation sites and we want to navigate with window.location.href to them.
        externalUrlRegex: "webda.io",

        // Optional: Replace parts of the item URLs from Algolia. Useful when using the same search index for multiple deployments using a different baseUrl. You can use regexp or string in the `from` param. For example: localhost:3000 vs myCompany.com/docs
        replaceSearchResultPathname: {
          from: "/docs/", // or as RegExp: /\/docs\//
          to: "/"
        },

        // Optional: Algolia search parameters
        searchParameters: {},

        // Optional: path for search page that enabled by default (`false` to disable it)
        searchPagePath: "search"

        //... other Algolia params
      }
    })
};

module.exports = config;
