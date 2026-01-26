- Start Date: 2026-01-26
- RFC PR: -
- Issue: -
- Affected components
    + [ ] [ui5-builder](../packages/builder)
    + [ ] [ui5-server](../packages/server)
    + [ ] [ui5-cli](../packages/cli)
    + [ ] [ui5-fs](../packages/fs)
    + [ ] [ui5-project](../packages/project)
    + [ ] [ui5-logger](../packages/logger)

# RFC 0014 NPM Package Integration for UI5 Projects

## Summary

This RFC proposes enabling seamless integration of NPM packages (ESM, CJS, and UI5 Web Components) into UI5 applications and libraries by providing automated bundling and transformation to UI5's AMD format through a new **built-in standard task and middleware** in UI5 Tooling.

## Motivation

### Current Limitations

UI5 applications currently face significant challenges when attempting to use NPM packages:

1. **Module Format Incompatibility**: UI5 uses AMD (`sap.ui.define`), while modern NPM packages use ESM (`import/export`) or CJS (`require/module.exports`)
2. **Manual Bundling Required**: Developers must manually bundle and transform NPM packages, adding complexity to the build process
3. **No Standard Approach**: Each project implements custom solutions, leading to inconsistent implementations and maintenance burden
4. **Web Components Complexity**: Integrating modern Web Components (including UI5's own `@ui5/webcomponents`) requires intricate wrapper generation and metadata transformation

### Use Cases

This proposal addresses several critical use cases:

1. **Utility Libraries**: Using modern utility libraries like `lodash`, `date-fns`, `validator.js` without manual bundling
2. **ESM-Only Packages**: Supporting packages that only ship ESM builds (e.g., `nanoid` v5+, `chalk` v5+)
3. **UI5 Web Components**: Enabling libraries & applications to bundle and expose UI5 Web Components with proper UI5 control wrappers
4. **Security Updates**: Allowing quick updates to NPM dependencies for security patches without rebuild tooling
5. **Modern Development**: Bridging the gap between UI5's AMD system and the modern JavaScript ecosystem

### Expected Outcome

- **Integration**: NPM packages work out-of-the-box in UI5 projects
- **Build-Time Bundling**: Automatic transformation during `ui5 build`
- **Dev-Time Support**: On-demand bundling during `ui5 serve` for fast development cycles
- **Standard Compliance**: Output follows UI5's AMD module format and naming conventions
- **Web Component Support**: Seamless integration of `@ui5/webcomponents` with proper UI5 control wrappers

### Proof of Concept

This RFC is supported by a PoC in `internal/npm-integration-poc/` that:
- Validates the Rollup-based bundling approach
- Demonstrates ESM, CJS, and Web Components transformation
- Compares three implementation approaches ([ui5-tooling-modules](https://www.npmjs.com/package/ui5-tooling-modules), hybrid (using only the webcomponents rollup plugin from [ui5-tooling-modules](https://www.npmjs.com/package/ui5-tooling-modules)), standalone custom PoC)
- Provides educational documentation for understanding the complete pipeline
- Was built from scratch (no code dependencies) to validate architectural decisions

**Relationship to ui5-tooling-modules**: The community package [ui5-tooling-modules](https://github.com/ui5-community/ui5-tooling-modules) already provides production-ready NPM integration. Our PoC studied its patterns to understand the problem space and validate that similar concepts should be standardized in UI5 Tooling core.

## Detailed Design

### Architecture Overview

![Architecture Overview](resources/0014-npm-integration/architecture-overview.svg)

The solution consists of three main components working together in a pipeline:

1. **Scanner**: Analyzes UI5 source code to detect NPM package dependencies by parsing import/require statements
2. **Bundler**: Uses Rollup.js to transform packages from their native format (ESM/CJS) into UI5's AMD format
3. **Writer**: Outputs the transformed modules either to the workspace (build task) or in-memory cache (dev middleware)

The flow progresses from reading `package.json` dependencies, through transformation, to final output in `resources/thirdparty/`.

### Component 1: Dependency Scanner

**Purpose**: Automatically detect NPM packages used in UI5 source code

**How it works**: The scanner traverses the UI5 project's source files to identify NPM package usage. It parses JavaScript and TypeScript files looking for:

- ESM import statements: `import validator from 'validator'`
- CommonJS require calls: `const lodash = require('lodash')`
- UI5 AMD references: `sap.ui.define(['thirdparty/nanoid'], ...)`

**Detection Strategy**:
1. Parse all UI5 source files (JavaScript/TypeScript)
2. Extract import/require statements using AST (Abstract Syntax Tree) analysis
3. Filter NPM packages by excluding UI5 namespaces (e.g., `sap/*`, `library/*`)
4. Resolve exact versions from `package.json` and package lock files
5. Build complete dependency graph including transitive dependencies
6. Deduplicate and order dependencies for optimal bundling

### Component 2: Rollup-Based Bundler

**Why Rollup?**

Rollup was chosen over alternatives (Webpack, esbuild, Browserify) for several reasons:

1. **Tree Shaking**: Rollup pioneered dead-code elimination, producing smaller bundles
2. **Clean Output**: Generates readable AMD output without runtime overhead
3. **Plugin Ecosystem**: Extensive plugin support for various transformations
4. **Format Flexibility**: Native support for multiple output formats (AMD, UMD, ESM, CJS)
5. **ESM-First**: Built with ESM as the primary format, aligning with modern standards
6. **Performance**: Fast bundling suitable for both build-time and dev-time usage
7. **Code Splitting**: Advanced chunking for optimal loading strategies
7. **Webcomponents**: They use it for their internal build through [Vite](https://vite.dev/)

**Alternative Comparison**:

| Feature | Rollup | Webpack | esbuild | Browserify |
|---------|--------|---------|---------|------------|
| **AMD Output** | Native | Via plugin | Limited | Via plugin |
| **Tree Shaking** | Excellent | Good | Limited | None |
| **Output Size** | Smallest | Larger | Small | Largest |
| **Build Speed** | Fast | Moderate | Fastest | Slow |
| **Clean Output** | Yes | No (runtime) | Yes | No |
| **Plugin Ecosystem** | Extensive | Extensive | Limited | Dated |
| **ESM Native** | Yes | Partial | Yes | No |

**Bundle Process in ui5-tooling-modules**:

The bundling process uses a Rollup plugin chain to transform NPM packages:

1. **Environment Variable Replacement**: Substitutes Node.js environment variables (e.g., `process.env.NODE_ENV`) with static values for browser compatibility

2. **JSON File Support**: Enables importing JSON files as modules, common in NPM packages for configuration

3. **Node.js Polyfills**: Provides browser-compatible implementations of Node.js built-in modules like `path`, `process`, `buffer`, `events`, `stream`, and `util`

4. **Module Resolution**: Resolves package imports from `node_modules` with browser-specific conditions, preferring browser builds when available

5. **CommonJS Transformation**: Converts CommonJS packages (using `require`/`module.exports`) to ESM format as an intermediate step

6. **UI5 Web Components Plugin**: Custom plugin for generating UI5 control wrappers and metadata transformation (detailed in Component 3)

The final output uses AMD format with `sap.ui.define` as the module loader, making it compatible with UI5's module system.

**Transformation Pipeline**:

![Transformation Pipeline](resources/0014-npm-integration/transformation-pipeline.svg)

The transformation pipeline varies by package type:

**ESM Packages** (e.g., nanoid): Direct resolution from node_modules, then transformation to AMD format. The simplest pipeline since ESM is the target format for Rollup.

**CJS Packages** (e.g., lodash): Additional CommonJS plugin step converts `require()`/`module.exports` to ESM imports/exports before AMD transformation. This intermediate ESM step allows Rollup's tree-shaking to work.

**Web Components** (e.g., @ui5/webcomponents): Most complex pipeline involving metadata extraction, UI5 control wrapper generation, and proper namespace handling.

### Component 3: UI5 Web Components Seamless Integration

**Challenge**: Web Components are not UI5 controls. They need:
1. UI5 control wrapper extending `sap.ui.core.webc.WebComponent`
2. Metadata transformation (properties, events, slots → UI5 metadata format)
3. Tag name scoping to avoid conflicts
4. UI5 control wrapper generation with proper namespacing

**How ui5-tooling-modules handles this**:

#### Step 1: Metadata Extraction

Web Components ship with a `custom-elements.json` file that describes their API. The plugin:

1. Locates the metadata file in the package directory
2. Parses the JSON structure to extract component information
3. Identifies properties, slots (UI5 aggregations), events, and tag names
4. Extracts type information and default values

For example, MessageStrip metadata includes:
- Properties: `design`, `hideIcon`, `hideCloseButton` with their types and defaults
- Slots: Default content slot for the message text
- Events: `close` event when the close button is pressed
- Tag name: `ui5-message-strip`

#### Step 2: Transform to UI5 Metadata

The plugin transforms Web Component metadata into UI5 control metadata format:

**Properties Transformation**:
- Web Component properties become UI5 control properties
- Each property includes type mapping (string, boolean, enum)
- Specifies whether to use HTML attributes or DOM properties
- Preserves default values

**Slots to Aggregations**:
- Web Component slots become UI5 aggregations
- Default slot becomes the main content aggregation
- Named slots become specific aggregations
- All aggregations accept UI5 controls

**Events Mapping**:
- Web Component events become UI5 events
- Event parameters are extracted and typed
- Event names follow UI5 conventions

**Tag Name Scoping**:
- Original tag names are suffixed (e.g., `ui5-message-strip-custom`)
- Prevents conflicts with native Web Components in the same page
- Configurable scope suffix for multi-version scenarios

#### Step 3: Generate UI5 Control Wrapper

![Web Components Integration Flow](resources/0014-npm-integration/webcomponents-flow.svg)

The rollup plugin generates UI5 control wrappers:

**Wrapper Characteristics:**
- Uses absolute namespace paths to reference the native bundle
- Intended for application consumption
- Module name includes full project namespace
- Extends `sap.ui.core.webc.WebComponent` base class
- Includes transformed metadata (properties, aggregations, events)
- Uses scoped tag names to avoid conflicts with native Web Components

**Example Module Name:** `com.example.app.thirdparty.@ui5.webcomponents.dist.MessageStrip`

#### Step 4: Package Exports

The plugin generates package-level entry point files that **declare package dependencies** and ensure proper loading order.

**Purpose**: Ensure base packages load before controls and prevent "module not found" errors

**Why They're Needed**:

When Rollup bundles a web component like `@ui5/webcomponents/dist/MessageStrip.js`, it creates a self-contained bundle with tree-shaken code. However, the web component depends on **base packages** (like `@ui5/webcomponents-base`) that provide foundational classes and utilities.

**Problem Without Package Exports**:
```javascript
// UI5 Control Wrapper: thirdparty/@ui5/webcomponents/dist/MessageStrip.js
sap.ui.define([
    "com/example/app/thirdparty/@ui5/webcomponents",  // ❌ File doesn't exist!
    "sap/ui/core/webc/WebComponent"
], function(Package, WebComponent) {
    // Control implementation
});
```
Result: ❌ **UI5 loader error**: Cannot load module `com/example/app/thirdparty/@ui5/webcomponents`

**Solution With Package Exports**:
```javascript
// Package Export: thirdparty/@ui5/webcomponents.js
sap.ui.define([
    "com/example/app/thirdparty/@ui5/webcomponents-base"  // ✅ Declare base dependency
], function() {
    "use strict";
    return {
        // Package metadata
    };
});
```

Now the control wrapper can successfully reference this file:
```javascript
// UI5 Control Wrapper: thirdparty/@ui5/webcomponents/dist/MessageStrip.js
sap.ui.define([
    "com/example/app/thirdparty/@ui5/webcomponents",  // ✅ File exists!
    "sap/ui/core/webc/WebComponent"
], function(Package, WebComponent) {
    // Control implementation works!
});
```

**What Package Exports Provide**:
1. **Dependency Hub**: Central place to declare package-level dependencies (avoids duplicating base dependencies in every control)
2. **Loading Order**: Ensures base packages load before controls (UI5 loader respects sap.ui.define dependencies)
3. **Module Resolution**: Provides a file that exists when control wrappers reference the package namespace
4. **Future Extension**: Can be enhanced with library initialization and control registration (like ui5-tooling-modules does)

**Loading Chain Example**:

When a developer uses `<webc:MessageStrip xmlns:webc="com.example.app.thirdparty.@ui5.webcomponents.dist"/>`:

1. UI5 loads `thirdparty/@ui5/webcomponents/dist/MessageStrip.js` (control wrapper)
2. Control wrapper depends on `thirdparty/@ui5/webcomponents.js` (package export)
3. Package export depends on `thirdparty/@ui5/webcomponents-base.js` (base package export)
4. Base package export depends on native bundles (foundational web component code)
5. All dependencies loaded in correct order → Control renders successfully

### Component 4: Output Writers

**Strategy Pattern for Different Contexts**:

The writer component uses different strategies depending on the context:

**WorkspaceWriter (Build Task)**:
- Writes transformed modules to the project workspace
- Creates files in `resources/thirdparty/` directory
- Persists files to disk for production builds
- Used during `ui5 build` command

**CacheWriter (Dev Middleware)**:
- Stores transformed modules in memory
- Serves files on-demand without disk writes
- Caches bundle results for fast reload
- Used during `ui5 serve` command

Both strategies implement the same interface, allowing the bundler core to remain agnostic of the output mechanism.

### Integration Options

As a **built-in standard task and middleware** in UI5 Tooling.


### PoC Playground

The Proof of Concept demonstrates three parallel approaches to understand the integration:

#### PoC Approach 1: ui5-tooling-modules (Standard)
- Uses official package directly
- Zero configuration required
- Full feature set (JSDoc, TypeScript definitions, asset bundling)
- Handles ALL NPM packages automatically

#### PoC Approach 2: Hybrid Reuse
- Reuses `rollup-plugin-webcomponents.js` from ui5-tooling-modules
- Custom task/middleware infrastructure
- Educational: Learn from official implementation
- Handles Web Components only

#### PoC Approach 3: Standalone Custom
- Fully custom implementation built from scratch
- Educational: Deep understanding of transformation

**Comparison with ui5-tooling-modules**:

| Feature | ui5-tooling-modules | PoC (Standalone) |
|---------|---------------------|------------------|
| **Bundler** | Rollup.js | Rollup.js ✓ |
| **Plugin Count** | 14 plugins | 3 plugins (simplified) |
| **Auto-Scanning** | ✓ Automatic | ✗ Manual specification |
| **JSDoc Generation** | ✓ Yes | ✗ Skipped |
| **TypeScript .d.ts** | ✓ Yes | ✗ Skipped |
| **Asset Bundling** | ✓ CSS, fonts, images | ✗ Not implemented |
| **Monkey Patches** | ✓ UI5 compatibility fixes | ✗ Modern UI5 only |
| **Caching** | ✓ MD5-based | ✗ Basic Map-based |
| **Sourcemaps** | ✓ Yes | ✗ Not implemented |
| **ESM Support** | ✓ Full | ✓ Full |
| **CJS Support** | ✓ Full | ✓ Full |
| **Web Components** | ✓ Advanced | ✓ Basic |
| **Middleware** | ✓ Dev server | ✓ Implemented |
| **Task** | ✓ Build | ✓ Implemented |

**What the PoC Achieves**:
- ✓ Core bundling with Rollup
- ✓ ESM/CJS → AMD transformation
- ✓ UI5 Web Components with proper UI5 control wrappers
- ✓ Build-time bundling (task)
- ✓ Dev-time on-demand bundling (middleware)
- ✓ Three parallel implementations for learning
- ✓ Comprehensive documentation

**What's Missing in PoC**:
- ✗ Automatic dependency scanning
- ✗ JSDoc generation for better IDE support
- ✗ TypeScript definition generation
- ✗ Asset bundling (CSS, fonts, images)
- ✗ Monkey patches for UI5 version compatibility
- ✗ Advanced caching with invalidation
- ✗ Sourcemap support
- ✗ Tree shaking optimization
- ✗ Error recovery and debugging features

### Test Scenarios

The PoC includes three test scenarios demonstrating different package types:

**Scenario 1: ESM Integration (nanoid)**
- Tests pure ESM-only packages (v5+)
- Demonstrates packages that cannot use require()
- Output: `dist/01-esm-integration/nanoid.js`
- Use case: Modern ESM packages like `chalk`, `ora`, `node-fetch` v3+

**Scenario 2: CJS Integration (lodash)**
- Tests pure CommonJS packages
- Demonstrates legacy CJS → ESM → AMD transformation
- Output: `dist/02-cjs-integration/lodash.js`
- Use case: Traditional NPM packages like `lodash`, `moment`, `axios`

**Scenario 3: Web Components Integration (MessageStrip)**
- Tests `@ui5/webcomponents` integration
- Demonstrates UI5 control wrapper generation
- Output: `dist/03-webcomponents-integration/thirdparty/`
- Use case: UI5 Web Components in libraries

### Consolidated Application

The PoC includes a consolidated UI5 application that demonstrates all three approaches working together:

**Purpose**: Show real-world usage of bundled NPM packages in a UI5 app

**Features**:
- MessageStrip Web Component
- validator.js for form validation
- Interactive controls to test properties and events

**Why Three Approaches?**
1. **Educational**: Learn how each method works
2. **Comparison**: See output differences
3. **Flexibility**: Choose appropriate level of complexity
4. **Validation**: Ensure all approaches produce working code

**Structure**:
```
consolidated-app/
├── ui5-tooling-modules.yaml    # Standard (production-ready)
├── ui5-webc-reuse.yaml         # Hybrid (learning)
├── ui5-webc-standalone.yaml    # Custom (deep understanding)
└── webapp/                     # Single UI5 application
    ├── view/Main.view.xml      # Uses MessageStrip
    └── controller/Main.js      # Controls component properties
```

**Build Commands**:
```bash
# Build with each approach
npm run build:tooling-modules  # → dist/
npm run build:webc-reuse       # → dist-webc-reuse/
npm run build:webc-standalone  # → dist-webc-standalone/

# Serve with each approach (different ports)
npm run serve:tooling-modules  # Port 8081
npm run serve:webc-reuse       # Port 8082
npm run serve:webc-standalone  # Port 8083
```

This allows developers to:
- Compare output file structures
- Verify runtime behavior consistency
- Measure bundle sizes
- Choose implementation approach

## Appendix: ui5-tooling-modules Architecture & Features

This section aims to document the functionality of [ui5-tooling-modules](https://github.com/ui5-community/ui5-tooling-modules). This serves as a reference for ensuring feature parity in the proposed built-in solution.

### Package Overview

**Name**: `ui5-tooling-modules`  
**Repository**: https://github.com/ui5-community/ui5-ecosystem-showcase/tree/main/packages/ui5-tooling-modules  
**NPM**: https://www.npmjs.com/package/ui5-tooling-modules  


### Core Architecture

The package provides **three main components**:

1. **Custom Task** (`ui5-tooling-modules-task`): Build-time bundling during `ui5 build`
2. **Custom Middleware** (`ui5-tooling-modules-middleware`): Dev-time on-demand bundling during `ui5 serve`
3. **Rollup Plugins**: Specialized transformation logic for different package types

### Component 1: Build Task (`ui5-tooling-modules-task`)

**Purpose**: Transform and bundle NPM packages during the build process

**How It Works**:

1. **Workspace Analysis**:
   - Reads `package.json` to identify project dependencies
   - Reads `package-lock.json` or `yarn.lock` for version resolution
   - Identifies UI5 application or library type

2. **Dependency Scanning**:
   - Traverses all JavaScript/TypeScript files in the workspace
   - Uses AST parsing to extract:
     - ESM imports: `import x from 'package'`
     - CJS requires: `require('package')`
     - Dynamic imports: `import('package')`
   - Filters out UI5 namespaces (e.g., `sap/*`, `library/*`)
   - Builds dependency graph including transitive dependencies

3. **Rollup Bundling**:
   - Creates separate Rollup instances for each detected package
   - Applies appropriate plugin chain based on package type
   - Generates AMD-format bundles with `sap.ui.define`
   - Outputs to `**/thirdparty/` directory

4. **Additional Outputs**:
   - Generates JSDoc comments for IDE support
   - Creates TypeScript definition files (`.d.ts`)
   - Bundles CSS, fonts, and other assets
   - Creates sourcemaps for debugging

### Component 2: Dev Middleware (`ui5-tooling-modules-middleware`)

**Purpose**: Provide on-demand bundling during development

**How It Works**:

1. **Request Interception**:
   - Intercepts HTTP requests matching `/**/thirdparty/*` pattern
   - Checks if request corresponds to a bundled NPM package


### Component 3: Rollup Plugin Chain

The package uses **14 specialized Rollup plugins** in a carefully orchestrated chain:

#### 3.1 Core Plugins (External)

1. **`@rollup/plugin-replace`**:
   - Replaces Node.js environment variables with static values
   - Example: `process.env.NODE_ENV` → `"production"`
   - Important for browser compatibility

2. **`@rollup/plugin-json`**:
   - Enables importing JSON files as modules
   - Example: `import pkg from './package.json'`
   - Common pattern in NPM packages

3. **`rollup-plugin-polyfill-node`**:
   - Provides browser polyfills for Node.js built-ins
   - Modules: `path`, `process`, `buffer`, `events`, `stream`, `util`, `crypto`, `url`
   - Automatically included when package imports Node.js modules

4. **`@rollup/plugin-node-resolve`**:
   - Resolves modules from `node_modules/`
   - Respects `browser` field in `package.json`
   - Handles package.json `exports` field
   - Implements Node.js module resolution algorithm

5. **`@rollup/plugin-commonjs`**:
   - Transforms CommonJS (`require`/`module.exports`) to ESM
   - Handles dynamic requires with analysis
   - Preserves `this` context for CJS modules
   - Critical for legacy NPM packages

6. **`@rollup/plugin-terser`**:
   - Minifies output bundles
   - Removes comments and whitespace
   - Only active during `ui5 build`

#### 3.2 Custom Plugins (Internal)

7. **`rollup-plugin-webcomponents.js`**:
   - **Purpose**: Transform UI5 Web Components into UI5 controls
   - **Functionality**:
     - Reads `custom-elements.json` metadata
     - Extracts properties, events, slots, tag names
     - Transforms WC metadata → UI5 control metadata
     - Generates UI5 control wrapper extending `sap.ui.core.webc.WebComponent`
     - Creates package-level exports for dependency management
     - Handles base package dependencies (`@ui5/webcomponents-base`)
     - Generates scoped tag names to avoid conflicts
   - **Output**: Two files per component:
     - Native bundle: `thirdparty/MessageStrip.js` (AMD-wrapped WC)
     - UI5 wrapper: `thirdparty/@ui5/webcomponents/dist/MessageStrip.js`

8. **`rollup-plugin-ui5-resolve.js`**:
   - **Purpose**: Resolve UI5 module paths
   - **Functionality**:
     - Handles `sap/ui/*` namespace imports
     - Marks UI5 modules as external (not bundled)
     - Converts UI5 paths to AMD module references
     - Example: `sap/ui/core/Control` → external dependency

9. **`rollup-plugin-amd-custom.js`**:
   - **Purpose**: Generate custom AMD format output
   - **Functionality**:
     - Wraps bundles with `sap.ui.define()`
     - Generates proper dependency arrays
     - Handles namespace resolution
     - Supports `addToNamespace` option for global exposure

10. **`rollup-plugin-assets.js`**:
    - **Purpose**: Bundle CSS, fonts, images, and other assets
    - **Functionality**:
      - Detects asset imports in JS code
      - Copies assets to output directory
      - Transforms CSS imports to UI5-compatible paths
      - Handles relative path resolution

11. **`rollup-plugin-jsdoc.js`**:
    - **Purpose**: Generate JSDoc comments for IDE support
    - **Functionality**:
      - Extracts JSDoc from source modules
      - Generates combined JSDoc output
      - Creates `package-name-jsdoc.js` files

12. **`rollup-plugin-dts.js`**:
    - **Purpose**: Generate TypeScript definition files
    - **Functionality**:
      - Extracts TypeScript types from `.d.ts` files
      - Bundles type definitions
      - Creates `package-name.d.ts` files

13. **`rollup-plugin-monkey-patches.js`**:
    - **Purpose**: Apply compatibility fixes for UI5 versions
    - **Functionality**:
      - Detects UI5 version from project
      - Applies version-specific patches
      - Fixes known incompatibilities
      - Ensures backward compatibility with older UI5 versions

14. **`rollup-plugin-external-deps.js`**:
    - **Purpose**: Mark configured dependencies as external
    - **Functionality**:
      - Reads `providedDependencies` configuration
      - Marks dependencies as external (not bundled)
      - Example: UI5 libraries, already-bundled packages
      - Reduces bundle duplication


### Advanced Features

#### Feature 1: Automatic Dependency Detection

**How It Works**:
- Scans all JavaScript/TypeScript files in project workspace
- Uses AST parsing to extract import/require statements
- Handles dynamic imports: `import('./module.js')`
- Filters out UI5 namespaces automatically
- Resolves transitive dependencies from `package.json`

#### Feature 2: JSDoc Generation

**Implementation**:
- Extracts JSDoc comments from source modules
- Combines JSDoc from multiple files in a package
- Generates `<package-name>-jsdoc.js` file
- Registers documentation with UI5 runtime


#### Feature 3: TypeScript Definition Files

**Implementation**:
- Extracts `.d.ts` files from package
- Bundles type definitions
- Generates `<package-name>.d.ts` file
- Declares AMD module with proper types


#### Feature 4: Asset Bundling

**Supported Asset Types**:
- CSS files
- Font files (woff, woff2, ttf, eot)
- Images (png, jpg, svg, gif)
- JSON files

**How It Works**:
- Detects asset imports in JavaScript: `import './styles.css'`
- Copies assets to `thirdparty/` directory
- Transforms import paths to UI5-compatible URLs
- Injects CSS into `<style>` tags at runtime (optional)
- Converts small assets to data URLs (configurable threshold)

#### Feature 5: Monkey Patches & Compatibility

**Purpose**: Ensure compatibility across UI5 versions

**Implementation**:
- Detects UI5 version from project
- Applies version-specific patches
- Fixes known API incompatibilities
- Handles deprecated APIs gracefully


