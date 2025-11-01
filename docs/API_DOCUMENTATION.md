# UI5 API Documentation Generation Guide

## Overview

This guide explains how to generate and use API documentation from UI5 projects, specifically addressing the `build jsdoc` task and the generated `api.json` files.

## Understanding the Two Documentation Formats

The UI5 tooling supports two complementary approaches to API documentation:

### 1. JSDoc HTML Output (Classic Documentation)

**What it is:** Traditional HTML documentation pages generated using JSDoc with custom UI5 plugins and templates.

**When to use:**
- Quick local documentation browsing
- Internal company documentation portals
- Offline documentation packages
- CI/CD pipelines requiring HTML artifacts

**How to generate:**
```bash
# For this monorepo
npm run jsdoc-generate

# For your UI5 library project
ui5 build --all
```

**Output location:** `site/api/` directory containing a complete HTML documentation site.

### 2. API JSON Format (UI5 SDK Integration)

**What it is:** Structured JSON metadata (`api.json`) following the UI5 API schema, designed for consumption by the official UI5 SDK API reference viewer.

**When to use:**
- Integration with the official UI5 SDK documentation
- Custom API tooling that consumes structured metadata
- Programmatic API analysis
- Building custom documentation UIs

**How to generate:**
```bash
# During library build with jsdoc enabled
ui5 build jsdoc

# The output will be at:
# dist/test-resources/<your-lib>/designtime/api.json
```

## Working with `api.json` Files

### Option A: Convert to Simple HTML (Quick & Easy)

We've added a lightweight converter tool that transforms `api.json` into browsable HTML:

```bash
# Using the npm script (for workspace-level docs)
npm run apijson-to-html

# Or directly with custom paths
node tools/convert-apijson-to-html.cjs path/to/api.json output/docs.html
```

**Benefits:**
- Zero dependencies beyond Node.js
- Single self-contained HTML file
- Works offline
- Easy to host on any web server

**Limitations:**
- Simplified UI compared to official UI5 SDK
- No advanced features like inheritance diagrams
- Basic styling only

See [tools/README.md](tools/README.md) for detailed usage instructions.

### Option B: Integrate with UI5 SDK API Reference Viewer

The official UI5 SDK includes an API reference viewer (`apiref`) that provides the full-featured UI5 documentation experience.

**Steps:**
1. Generate your library's `api.json` using `ui5 build jsdoc`
2. The UI5 builder can combine multiple library `api.json` files using the SDK transformation task
3. Host the combined `api.json` with the UI5 apiref viewer application
4. Configure the apiref viewer to load your custom libraries

**Note:** This requires access to or hosting of the UI5 SDK infrastructure. For internal use, you may need to set up a custom instance.

### Option C: Use Standard JSDoc HTML Output

The simplest approach for most use cases:

```bash
npm run jsdoc-generate
```

This generates complete HTML documentation using:
- The JSDoc engine with UI5-specific plugins
- Custom UI5 templates that understand UI5 semantics
- The Docdash theme (configurable)

**Output:** `site/api/index.html` and related files

**To view:**
```bash
# Open in browser
open site/api/index.html

# Or serve with a local web server
npx http-server site -p 8080
npx serve site
```

## Recommended Workflow for Internal Documentation

For hosting internal API documentation of custom UI5 libraries:

### Setup
1. Enable JSDoc generation in your `ui5.yaml`:
```yaml
builder:
  jsdoc:
    enabled: true
```

2. Add proper JSDoc comments to your code following UI5 conventions:
```javascript
/**
 * A custom UI5 control for data visualization
 *
 * @class
 * @extends sap.ui.core.Control
 * @public
 * @alias company.custom.DataChart
 */
```

### Build & Generate
```bash
# Build your library with docs
ui5 build jsdoc

# Option 1: Use the generated api.json with our converter
node tools/convert-apijson-to-html.cjs \
  dist/test-resources/company/custom/designtime/api.json \
  docs/api.html

# Option 2: Generate full JSDoc HTML (if configured)
npm run jsdoc-generate
```

### Host
```bash
# Deploy the generated HTML to your internal docs server
# Examples:
# - Copy to internal web server
# - Deploy to GitHub Pages
# - Use Netlify/Vercel for static hosting
# - Integrate with company documentation portal
```

## Configuration Files

- **jsdoc.json** - JSDoc configuration for local development
- **jsdoc-workspace.json** - JSDoc configuration for workspace/monorepo mode
- **jsdoc-plugin.cjs** - Custom JSDoc plugin for handling UI5-specific syntax
- **packages/builder/lib/processors/jsdoc/** - UI5 builder's JSDoc processing pipeline

## Future Plans

There are no current plans in the public roadmap to add HTML output directly to the `build jsdoc` task, as:
1. The standard JSDoc tooling already provides HTML generation
2. The `api.json` format serves the specific purpose of SDK integration
3. Custom HTML generation can be achieved via the converter tool or standard JSDoc

However, the converter tool (`tools/convert-apijson-to-html.cjs`) provides a pragmatic solution for quick HTML generation from `api.json` files.

## Common Use Cases

### Use Case 1: Quick Local Documentation
```bash
npm run jsdoc-generate
open site/api/index.html
```

### Use Case 2: Internal Company API Portal
```bash
ui5 build jsdoc
node tools/convert-apijson-to-html.cjs \
  dist/test-resources/*/designtime/api.json \
  company-portal/api-docs.html
# Deploy company-portal/ to internal server
```

### Use Case 3: CI/CD Documentation Pipeline
```yaml
# .github/workflows/docs.yml
- name: Generate API Docs
  run: |
    npm run jsdoc-generate
    npm run apijson-to-html
    
- name: Deploy to GitHub Pages
  uses: peaceiris/actions-gh-pages@v3
  with:
    publish_dir: ./site
```

## Additional Resources

- [UI5 Tooling Documentation](https://sap.github.io/ui5-tooling/)
- [JSDoc Official Documentation](https://jsdoc.app/)
- [UI5 SDK (for reference)](https://ui5.sap.com/)
- [tools/README.md](tools/README.md) - Converter tool documentation
- [Contributing Guidelines](CONTRIBUTING.md)

## Questions & Support

For questions about UI5 Tooling:
- [Stack Overflow - ui5-cli tag](https://stackoverflow.com/questions/tagged/ui5-cli)
- [OpenUI5 Slack #tooling channel](https://ui5-slack-invite.cfapps.eu10.hana.ondemand.com)
- [GitHub Issues](https://github.com/UI5/cli/issues)
