# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

UI5 CLI v5 — an open, modular toolchain for developing UI5 framework applications. This is a **monorepo** using npm workspaces containing 6 public packages and 2 internal packages. All code uses **ESM** (`"type": "module"`).

**Node requirement**: `^22.20.0 || >=24.0.0`

## Commands

### Install
```bash
npm ci --engine-strict
```

### Run all tests (lint + coverage + license checks + knip)
```bash
npm test
```

### Lint
```bash
npm run lint                              # All workspaces
npm run lint --workspace=@ui5/cli         # Single package
```

### Unit tests
```bash
npm run unit                              # All workspaces
npm run unit --workspace=@ui5/builder     # Single package
npx ava test/lib/some/test.js             # Single test file (run from package dir)
```

### Unit tests with verbose logging
```bash
npm run unit-verbose --workspace=@ui5/cli
```

### Coverage
```bash
npm run coverage                          # All workspaces
npm run coverage --workspace=@ui5/server  # Single package
```

## Architecture

```
@ui5/cli          CLI entry point (yargs). Commands in lib/cli/commands/
  ├── @ui5/project   Project graph, config loading, dependency resolution (AJV schemas)
  ├── @ui5/builder   Build tasks & processors (JS bundling, minification, CSS, JSDoc)
  ├── @ui5/server    Express dev server with middleware architecture
  ├── @ui5/fs        Virtual file system with AbstractReader/AbstractReaderWriter
  └── @ui5/logger    Logging with configurable levels and progress bars
```

- **Entry point**: `packages/cli/bin/ui5.cjs` (CJS wrapper for Node compatibility) → loads `packages/cli/lib/cli/cli.js` (ESM)
- **Builder** uses a task/processor pattern: tasks orchestrate processors, both are loaded from repositories (`taskRepository.js`)
- **Server** uses an Express middleware pipeline; middlewares are loaded dynamically via `MiddlewareManager`
- **FS** provides a resource abstraction layer — `ReaderCollection` composes multiple readers; adapters handle real FS backends
- **Project** builds a `ProjectGraph` of dependencies from npm packages and UI5 config files (YAML/XML); validates configs with AJV JSON schemas

Internal packages:
- `internal/documentation` — VitePress docs + JSDoc + JSON schema generation
- `internal/shrinkwrap-extractor` — npm shrinkwrap utilities

## Code Style

- **Indentation**: tabs
- **Quotes**: double
- **Max line length**: 120
- **Semicolons**: required
- **No `console.log()`** — use `@ui5/logger` instead
- ESLint flat config with Google style base + JSDoc + AVA plugins

## Testing

- **Framework**: AVA with `esmock` for ESM module mocking, `sinon` for stubs/spies
- **Test location**: `packages/*/test/lib/**/*.js`
- **Helpers** (excluded from test runs): `test/**/__helper__/**`
- **Fixtures**: `test/fixtures/`, **Expected outputs**: `test/expected/`
- **Coverage**: NYC (Istanbul) — thresholds vary per package (70-90%)
- **Temp files**: `test/tmp/` (cleaned before each run via `rimraf`)

## Commit Convention

Conventional commits enforced via commitlint + husky. Subject must be sentence-case.

**Types**: `build`, `ci`, `deps`, `docs`, `feat`, `fix`, `perf`, `refactor`, `release`, `revert`, `style`, `test`

**Scopes** are package names: `builder`, `cli`, `documentation`, `fs`, `logger`, `project`, `server`, `shrinkwrap-extractor`. Some types restrict which scopes are valid (e.g., `feat` and `fix` only allow public package scopes).

Examples: `feat(builder): Add CSS source map support`, `fix(server): Correct middleware ordering`
