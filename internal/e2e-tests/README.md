# E2E Tests for UI5 CLI

End-to-end test environment for the UI5 CLI containing realistic user scenarios.

## Usage

```bash
npm install
npm run unit
```

## How It Works

Tests are run with the **Node.js built-in test runner**. Each test:

1. Copies a fixture project to a temporary directory (`./tmp`)
2. Runs `npm install` there (child process)
3. Runs `ui5 build` with varying configurations (child process)

The UI5 CLI executables are sourced directly from this repository at `packages/cli/bin/ui5.cjs`.

Some scenarios include multiple sequential builds with file modifications in between to simulate real-world development workflows. Node modules are getting installed on the fly for the first build and reused for subsequent builds (no reinstall).




## Fixtures

Located under `./fixtures/`:

| Fixture | Description |
|---|---|
| `application.a` | Sample JavaScript project (controller + `manifest.json`) |
| `application.a.ts` | Sample TypeScript project (based on [generator-ui5-ts-app](https://github.com/ui5-community/generator-ui5-ts-app)) |
