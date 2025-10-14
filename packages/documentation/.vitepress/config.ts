// using the defineConfig helper will provide TypeScript-powered
// intellisense for config options
import { defineConfig } from "vitepress";

// markdown
import MarkdownItImplicitFigures from "markdown-it-implicit-figures";
import MarkdownItPlantuml from "markdown-it-plantuml";

export default defineConfig({
  
  base: "/ui5-cli/v5/", // use this for github pages deployment or remove for CF
  srcDir: "docs",
  outDir: "dist",
  lang: "en-US",
  title: "UI5 Tooling",

  description: "An open and modular toolchain to develop state-of-the-art applications based on the UI5 framework.",
  lastUpdated: false, // disable git author info
  cleanUrls: false,
  ignoreDeadLinks: true,

  vue: {
    template: {
      compilerOptions: {
        // treat all tags with a "ui5-" prefix as custom elements
        isCustomElement: (tag: string) => tag.includes("ui5-"),
      },
    },
  },


  head: [
    [
      "link",
      { rel: "icon", type: "image/svg+xml", href: "/icons/ui5/O.svg" }

    ]
  ],

  themeConfig: {


    logo:  {
      light: "/images/Logo_B_RGB.png",
      dark: "/images/Logo_O_RGB.png"
    },
    externalLinkIcon: false,
    outline: [1, 3],

    nav: nav(),

    sidebar: {
      "/": guide(),
    },

    socialLinks: [

      { icon: "github", link: "https://github.com/UI5/cli" },
    ],

    footer: {

      message: `
        &copy; Copyright ${new Date().getFullYear()}, SAP SE and UI5 CLI Contributors <br/>
          <a style="margin:25px"href="https://www.sap.com/corporate/en/legal/impressum.html">Legal Disclosure</a>
          <a  style="margin:25px" href="https://www.sap.com/corporate/en/legal/terms-of-use.html">Terms of Use</a>
          <a  style="margin:25px" href="https://ui5.github.io/cli/stable/pages/Privacy/">Privacy</a>
          <a  style="margin:25px" href="https://www.sap.com/corporate/en/legal/trademark.html">Trademarks</a>
    `,


    },

    search: {
      provider: "local",
      //hotKeys: [], // disable hotkeys to avoid search while using UI5 web components input
    },



  },

  markdown: {
    externalLinks: {

    },

    //theme: "material-theme-palenight", // pre rc5 default
    // Add support for your own languages.
    // https://github.com/shikijs/shiki/blob/main/languages.md#supporting-your-own-languages-with-shiki
    languages: [
    ],

    // Configure the Markdown-it instance
    config: (md) => {
      // https://www.npmjs.com/package/markdown-it-implicit-figures
      md.use(MarkdownItImplicitFigures, {
        figcaption: true,
      });
      md.use(MarkdownItPlantuml, {
        //imageFormat: 'png'
      });
      // https://github.com/gmunguia/markdown-it-plantuml/issues/35
      md.use(MarkdownItPlantuml, {
        openMarker: "```plantuml",
        closeMarker: "```",
        diagramName: "uml",
        imageFormat: "svg",
      });
      // Textik https://textik.com/
      md.use(MarkdownItPlantuml, {
        openMarker: "```ditaa",
        closeMarker: "```",
        diagramName: "ditaa",
        imageFormat: "png",
      });
    },
  },


  vite: {
    build: {
      chunkSizeWarningLimit: 4000, // chunk for local search index dominates
    }
  }
});

function nav() {
  return [
    {

      text: 'V5',
      items: [
        {
          text: 'V4',
          link: '../v4/',
          target: "_self"
        },
        {
          text: 'V3',
          link: '../v3/',
          target: "_self"
        },
        {
          text: 'V2',
          link: '../v2/',
          target: "_self"
        }
      ]
    }
  ];
}

function guide() {

  return [

    {
      text: "Introduction",
      collapsed: false,

      items: [

        {
          text: "Home",
          link: "/pages/index",
        },
        {
          text: "Getting Started",
          link: "/pages/GettingStarted",
        },

      ],

    },
    {
      text: "UI5 CLI",
      collapsed: true,
      link: "/pages/CLI",


    },
    {
      text: "Configuration",
      collapsed: true,

      link: "/pages/Configuration",

    },
    {
      text: "Development",
      collapsed: false,
      items: [
        {
          text: "Overview",
          link: "/pages/Overview",
        },
        {
          text: "OpenUI5",
          link: "/pages/OpenUI5",
        },
        {
          text: "SAPUI5",
          link: "/pages/SAPUI5",
        },
        {
          text: "Workspace",
          link: "/pages/Workspace",
        },

      ],
    },

    {
      text: "Extensibility",
      collapsed: false,
      items: [
        {
          text: "Custom Tasks",
          link: "/pages/extensibility/CustomTasks",
        },
        {
          text: "Custom Server Middleware",
          link: "/pages/extensibility/CustomServerMiddleware",
        },
        {
          text: "Project Shims",
          link: "/pages/extensibility/ProjectShims",
        },
      ],
    },
    {
      text: "Modules",
      collapsed: false,
      items: [
        {
          text: "Server",
          link: "/pages/Server",
        },
        {
          text: "Builder",
          link: "/pages/Builder",
        },
        {
          text: "Project",
          link: "/pages/Project",
        },
        {
          text: "File System",
          link: "/pages/FileSystem",
        },
      ],
    },
    {
      text: "FAQ",
      collapsed: false,
      link: "/pages/FAQ",

    },
    {
      text: "Upgrade Guides",
      collapsed: false,
      items: [
        {
          text: "Migrate to v4",
          link: "/updates/migrate-v4",
        },
        {
          text: "Migrate to v3",
          link: "/updates/migrate-v3",
        },
        {
          text: "Migrate to v2",
          link: "/updates/migrate-v2",
        },
        {
          text: "Migrate to v1",
          link: "/updates/migrate-v1",
        },
      ],
    },
    {
      text: "Miscellaneous",
      collapsed: false,
      items: [
        {
          text: "Troubleshooting",
          link: "/pages/Troubleshooting",
        },
        {
          text: "Benchmarking",
          link: "/pages/Benchmarking",
        },
        {
          text: "ECMAScript Support",
          link: "/pages/ESSupport",
        },
        {
          text: "Code Analysis",
          link: "/pages/CodeAnalysis",
        },
      ],
    },
    {
      text: "API Reference",
      link: "https://ui5.github.io/cli/stable/api/index.html",

    },

  ];
}

