// using the defineConfig helper will provide TypeScript-powered
// intellisense for config options
import { defineConfig } from "vitepress";
import { join } from "node:path";

// markdown
import MarkdownItImplicitFigures from "markdown-it-implicit-figures";
import MarkdownItPlantuml from "markdown-it-plantuml";

// shikiji loading
import { promises as fs, truncate } from 'node:fs'
import type { LanguageInput, RawGrammar } from 'shiki'
const loadSyntax = async (file: string, name: string, alias: string = name): Promise<LanguageInput> => {
  const src = await fs.readFile(join(__dirname, file))
  const grammar: RawGrammar = JSON.parse(src.toString())
  return { name, aliases: [name, alias], ...grammar }
}

export default defineConfig({
  
  base: "/ui5-tooling/stable/", // use this for github pages deployment or remove for CF
  srcDir: "docs",
  outDir: "site",
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
      light: "/icons/ui5/B.svg",
      dark: "/icons/ui5/O.svg"
    },
    externalLinkIcon: false,
    outline: [1,3],

    nav: nav(),

    sidebar: {
      "/": guide(),
    },

    socialLinks: [

      { icon: "github", link: "https://github.com/SAP/ui5-tooling" },
    ],

    footer: {

      message: `
        &copy; Copyright ${new Date().getFullYear()}, SAP SE and UI5 Tooling Contributors <br/>
          <a style="margin:25px"href="https://www.sap.com/corporate/en/legal/impressum.html">Legal Disclosure</a>
          <a  style="margin:25px" href="https://www.sap.com/corporate/en/legal/terms-of-use.html">Terms of Use</a>
          <a  style="margin:25px" href="https://sap.github.io/ui25-tooling/stable/pages/Privacy/">Privacy</a>
          <a  style="margin:25px" href="https://www.sap.com/corporate/en/legal/trademark.html">Trademarks</a>
    `,


    },

    search: {
      provider: "local",
      //hotKeys: [], // disable hotkeys to avoid search while using UI5 web components input
    },



  },

  markdown: {
   
    
    //theme: "material-theme-palenight", // pre rc5 default
    // Add support for your own languages.
    // https://github.com/shikijs/shiki/blob/main/languages.md#supporting-your-own-languages-with-shiki
    languages: [
      // https://github.com/SAP-samples/vscode-abap-cds/blob/main/syntaxes/cds.tmLanguage.json
      await loadSyntax('syntaxes/abapcds.tmLanguage.json', 'abapcds'),
      // https://github.com/SAP/cds-textmate-grammar/blob/main/syntaxes/cds.tmLanguage.json
      await loadSyntax('syntaxes/cds.tmLanguage.json', 'cds'),
      // https://github.com/mechatroner/vscode_rainbow_csv/blob/master/syntaxes/csv.tmLanguage.json
      await loadSyntax('syntaxes/csv.tmLanguage.json', 'csv'),
      // https://github.com/mechatroner/vscode_rainbow_csv/blob/master/syntaxes/csv.tmLanguage.json
      await loadSyntax('syntaxes/scsv.tmLanguage.json', 'csvs'),
      // https://github.com/Huachao/vscode-restclient/blob/master/syntaxes/http.tmLanguage.json
      await loadSyntax('syntaxes/http.tmLanguage.json', 'rest'),
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

      text: 'V4',
      items: [
        {
          text: 'V3',
          link: 'https://konnraad.github.io/ui5-tooling/v3/',
          target: "_self"
        },
        {
          text: 'V2',
          link: 'https://konnraad.github.io/ui5-tooling/v2/',
          target: "_self"
        }
      ]
    },
   // {
   //   text: "Home",
   //   link: "/Home/",
   //   activeMatch: "/",
   // },
   // { text: "About", link: "/about" },

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
          link: "/HomePage",
        },
        {
          text: "Getting Started",
          link: "/GettingStarted",
        },

      ],

    },
    {
      text: "UI5 CLI",
      collapsed: true,
      link: "/CLI",


    },
    {
      text: "Configuration",
      collapsed: true,

      link: "/Configuration",

    },
    {
      text: "Development",
      collapsed: false,
      items: [
        {
          text: "Overview",
          link: "/Overview",
        },
        {
          text: "OpenUI5",
          link: "/OpenUI5",
        },
        {
          text: "SAPUI5",
          link: "/SAPUI5",
        },
        {
          text: "Workspace",
          link: "/Workspace",
        },

      ],
    },

    {
      text: "Extensibility",
      collapsed: false,
      items: [
        {
          text: "Custom Tasks",
          link: "/extensibility/CustomTasks",
        },
        {
          text: "Custom Server Middleware",
          link: "/extensibility/CustomServerMiddleware",
        },
        {
          text: "Project Shims",
          link: "/extensibility/ProjectShims",
        },
      ],
    },
    {
      text: "Modules",
      collapsed: false,
      items: [
        {
          text: "Server",
          link: "/Server",
        },
        {
          text: "Builder",
          link: "/Builder",
        },
        {
          text: "Project",
          link: "/Project",
        },
        {
          text: "File System",
          link: "/FileSystem",
        },
      ],
    },
    {
      text: "FAQ",
      collapsed: false,
      link: "/FAQ",

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
          link: "/Troubleshooting",
        },
        {
          text: "Benchmarking",
          link: "/Benchmarking",
        },
        {
          text: "ECMAScript Support",
          link: "/ESSupport",
        },
        {
          text: "Code Analysis",
          link: "/CodeAnalysis",
        },
      ],
    },
    {
      text: "API Reference",
      link: "https://sap.github.io/ui5-tooling/v4/api/index.html",

    },

  ];
}

