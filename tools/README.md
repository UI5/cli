# UI5 CLI Tools

This directory contains utility scripts for the UI5 CLI project.

## convert-apijson-to-html.cjs

A lightweight, dependency-free Node.js script that converts UI5-style `api.json` files into simple, browsable HTML documentation.

### Purpose

The UI5 builder's `jsdoc` task generates API metadata in JSON format (`api.json`). While this format is designed for consumption by the official UI5 SDK API reference viewer, you may want to quickly generate standalone HTML documentation for:

- Internal company API documentation hosting
- Quick local browsing without setting up the full UI5 SDK infrastructure
- CI/CD pipelines that need HTML output
- Offline documentation packages

### Usage

**Basic usage:**
```bash
node tools/convert-apijson-to-html.cjs <input-api.json> [output.html]
```

**Via npm script (recommended):**
```bash
npm run apijson-to-html
```

This will convert `workspace/apiref/api.json` to `site/api/index.html`.

**Custom paths:**
```bash
node tools/convert-apijson-to-html.cjs my-library/api.json docs/api.html
```

### Output

The script generates a single, self-contained HTML file with:
- Table of contents sidebar
- All modules, classes, interfaces, and enums
- Properties and methods with type information
- Code examples (if present in the api.json)
- Clean, responsive styling
- No external dependencies

### Workflow Integration

**Option 1: After UI5 build**
```bash
# Generate your UI5 library with jsdoc enabled
ui5 build jsdoc

# Convert the generated api.json to HTML
node tools/convert-apijson-to-html.cjs dist/test-resources/your-lib/designtime/api.json docs/api.html
```

**Option 2: Workspace-level documentation**
After running the UI5 builder's SDK transformation (which combines multiple library api.json files):
```bash
npm run apijson-to-html
```

### Serving the Generated HTML

Use any static file server:
```bash
# Using http-server
npx http-server site -p 8080

# Using serve
npx serve site

# Or open directly in browser
open site/api/index.html
```

### Limitations

This converter is intentionally simple and focused. It does **not**:
- Replicate the full UI5 SDK API reference UI styling
- Generate complex inheritance diagrams
- Provide advanced search functionality
- Support all possible api.json schema variations

For the full official UI5 API reference experience, integrate your `api.json` files with the UI5 SDK API reference viewer.

### Extending the Converter

The script is designed to be easily extensible. Common enhancements:
- Add cross-reference links between classes
- Include inheritance chains
- Generate a search index
- Add syntax highlighting for code examples
- Customize the CSS styling
- Support additional metadata fields

### See Also

- [UI5 Builder JSDoc Documentation](../packages/builder/README.md)
- [Contributing Guidelines](../CONTRIBUTING.md)
