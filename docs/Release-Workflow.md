# Release Please Workflow

This document explains the automated release and publishing workflow for the UI5 CLI monorepo using [Release Please](https://github.com/googleapis/release-please).

## Table of Contents

- [Overview](#overview)
- [Workflow Architecture](#workflow-architecture)
- [Release Please Configuration](#release-please-configuration)

## Overview

UI5 CLI uses an automated release workflow powered by Release Please to perform the following tasks:
1. **Automatically generate release PRs** based on Conventional Commits
2. **Update version numbers** across all workspace packages synchronously
3. **Generate changelogs** for each package
4. **Publish packages to npm** sequentially to respect dependency order
5. **Create GitHub releases** with release notes

## Workflow Architecture

![Release Workflow Diagram](./release-workflow-diagram.svg)

The workflow consists of three main jobs:

### 1. `release-please` Job
- **Trigger**: Push to `main` branch
- **Purpose**: Creates/updates version bumps and changelogs for all of the packages in a single PR.

### 2. `publish-packages` Job
- **Trigger**: Merge of release PR into `main` branch
- **Action**: Developer merges the release PR in GitHub
- **Result**: 
  - Release Please creates separate releases & tags in GitHub for every package
  - Packages are published to NPM sequentially (logger → fs → builder → server → project)
- **Strategy**: Sequential execution (`max-parallel: 1`) to ensure dependencies exist before dependents

### 3. `publish-cli` Job
- **Trigger**: All other packages have been published
- **Purpose**: Generates `npm-shrinkwrap.json` using `shrinkwrap-extractor` and publishes the CLI package
- **Why separate**: The shrinkwrap must contain published registry versions of workspace packages, not workspace links. This requires all dependencies to be available on npm registry first.
- **How it works**: The `shrinkwrap-extractor` reads the monorepo's `package-lock.json`, extracts production dependencies for `@ui5/cli`, converts workspace references to registry URLs, and generates a valid `npm-shrinkwrap.json` that will be included in the published CLI package.

## Release Please Configuration

The configuration is defined in [`release-please-config.json`](../release-please-config.json). This section explains our specific configuration choices and constraints.

### Key Configuration Decisions

#### PR Title Pattern

```json
"group-pull-request-title-pattern": "release: UI5 CLI packages ${branch}"
```

**Why we can't use `${version}`**: When using the `linked-versions` plugin, Release Please doesn't support the `${version}` placeholder in the PR title pattern when creating single PR with multiple packages. In such case release please does not have a single source of truth even though packages are released under the same version. 
Adding the root package, will resolve this, but it will pollute the release notes with unnecessary information that we need to manually remove.

**Documentation**: [group-pull-request-title-pattern](https://github.com/googleapis/release-please?tab=readme-ov-file#group-pull-request-title-pattern)

---

#### Prerelease Configuration

```json
"prerelease": true,
"prerelease-type": "alpha",
"release-as": "5.0.0-alpha.0"
```

**Purpose**: We're currently in alpha phase for v5.0.0. Once stable, these flags should be removed to enable normal semantic versioning.

---

#### Package Configuration

```json
"packages": {
  "packages/logger": { "component": "logger" },
  "packages/cli": { 
    "component": "cli"
  }
}
```

**Why explicit package configuration**: We explicitly list packages rather than using `exclude-paths` to:
1. Make it clear which packages are released
2. Prevent accidental inclusion of internal tooling
3. Keep the configuration maintainable

**Why `"component"` doesn't include `@ui5` scope**: Using scoped names (e.g., `"@ui5/logger"`) in the component field can cause incorrect GitHub tagging behavior.


---

#### Plugin Configuration

**`node-workspace` with `merge: false`**: When using `linked-versions`, the `node-workspace` plugin **must** set `merge: false` ([documented requirement](https://github.com/googleapis/release-please/blob/main/docs/manifest-releaser.md#linked-versions)). This prevents conflicts in Release Please's internal manifest processing between:
1. The `linked-versions` plugin synchronizing versions across all packages
2. The `node-workspace` plugin updating workspace dependency references

Without this flag, Release Please may fail to generate the release PR or produce incorrect version updates.

**Note**: Release Please always force-pushes to the PR branch, so this flag only affects internal manifest processing, not Git commit structure.

**`linked-versions`**: All UI5 CLI packages will be released together with synchronized version numbers.

**Known limitations**:
- Cannot resolve circular peer dependencies (e.g., `@ui5/project` ↔ `@ui5/builder`)
- May update lockfile entries for npm aliases incorrectly

**Workaround**: We manually update circular peer dependencies in the workflow after Release Please runs.

---

#### Changelog Sections

```json
"changelog-sections": [
  { "type": "feat", "section": "Features" },
  { "type": "fix", "section": "Bug Fixes" },
  { "type": "docs", "section": "Documentation", "hidden": true }
]
```

**Visible in changelogs**: Features, bug fixes, performance improvements, dependencies, reverts

**Hidden but tracked**: Documentation, styles, refactoring, tests, build, CI, release

**Rationale**: Internal changes don't need to appear in user-facing changelogs, but should still be tracked in commit history.

