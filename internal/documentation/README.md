# UI5 CLI Documentation

VitePress-based documentation site for the [UI5 CLI](https://github.com/UI5/cli) tooling. This internal package generates the static documentation published to GitHub Pages, including the auto-generated API reference (JSDoc), CLI command reference, and JSON Schema documentation.

## Quick Start

```bash
# Start the dev server (opens browser automatically)
npm start

# Or without auto-opening the browser
npm run dev
```

The development server starts at `http://localhost:5173` with hot-reload for live editing.

## Scripts

### Development

| Script | Purpose |
|--------|---------|
| `start` | Starts the VitePress dev server and opens the browser automatically. This is the primary entry point for local documentation development. |
| `dev` | Starts the VitePress dev server without opening the browser. Useful in container/remote environments or when the browser is already open. |
| `preview` | Serves the production build output (`dist/`) locally on port 8080 for verifying the built site before deployment. Requires `build:vitepress` to run first. |

### Build & Deploy

| Script | Purpose |
|--------|---------|
| `build:vitepress` | Builds the static site into the `dist/` directory. Requires `generate-cli-doc`, `schema-generate(-gh-pages)` and `jsdoc-generate(-gh-pages)` to be run first. |
| `build:assets` | Copies image assets from `docs/images/` to the build output directory. Must be run after `build:vitepress`. Accepts an optional destination path argument (defaults to `./dist`). |

### Code Generation

| Script | Purpose |
|--------|---------|
| `generate-cli-doc` | Executes `ui5 --help` (and subcommand help), parses the output, and renders `docs/pages/CLI.md` using a Handlebars template. The generated file is committed to the repository. |
| `schema-generate` | Bundles JSON Schema files from the local `@ui5/project` workspace package into `schema/ui5.yaml.json` and `schema/ui5-workspace.yaml.json`. |
| `schema-generate-gh-pages` | Same as `schema-generate` but reads schemas from downloaded packages in `tmp/packages/` (populated by `download-packages`) instead of the local workspace. Used for building documentation of published releases (v4). |
| `download-packages` | Downloads the latest published versions of all UI5 CLI packages (`@ui5/builder`, `@ui5/cli`, etc.) via `npm pack` and extracts them to `tmp/packages/`. This enables gh-pages builds to use published npm packages instead of local workspace code. |
| `jsdoc-generate` | Generates API documentation from local workspace package sources (`../../packages/*/lib/**/*.js`). Uses the workspace JSDoc config targeting the current development version (v5). |
| `jsdoc-generate-gh-pages` | Generates API documentation from downloaded packages in `tmp/packages/`. Uses the gh-pages JSDoc config targeting the published version (v4). Requires `download-packages` to run first. |
| `jsdoc` | Generates JSDoc API documentation from the local workspace and opens the result in the browser. Convenience wrapper for local development. |


## Dual-Version Documentation

This package supports building documentation for two different versions:

| Variant | JSDoc Config | Schema Mode | Sources | Target |
|---------|-------------|-------------|---------|--------|
| **Workspace (v5)** | `jsdoc-workspace.json` | `buildSchema.js` (default) | Local monorepo packages (`../../packages/`) | Current development version (v5) |
| **\*-gh-pages** | `jsdoc.json` | `buildSchema.js gh-pages` | Downloaded npm packages (`tmp/packages/`) | Published stable version (v4) |

The **workspace** variants are used for local development and v5 documentation. The **\*-gh-pages** variants are used during deployment to generate documentation from published package versions (v4).

## License

Apache-2.0 — see [LICENSE.txt](../../LICENSE.txt).
