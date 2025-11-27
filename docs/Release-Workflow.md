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
- **Purpose**: Create/update release PR with version bumps and changelogs
- **Output**: Information about created releases and PRs

### 2. `publish-packages` Job
- **Trigger**: Merger of release PR into `main` branch
- **Action**: Developer merges the release PR in GitHub
- **Result**: 
  - Release Please creates releases & tags in GitHub for every package
  - Packages are published to npm sequentially (logger → fs → builder → server → project)
- **Strategy**: Sequential execution (`max-parallel: 1`) to ensure dependencies exist before dependents

### 3. `publish-cli` Job
- **Trigger**: All other packages have been published
- **Purpose**: Generate `npm-shrinkwrap.json` and publish the CLI package
- **Dependency**: Requires all other packages to be available on npm registry

## Release Please Configuration

The configuration is defined in [`release-please-config.json`](../release-please-config.json). Below is a detailed explanation of each property:


### Pull Request Title Pattern

```json
"group-pull-request-title-pattern": "release: UI5 CLI packages ${branch}"
```

**Purpose**: Defines the title format for release pull requests in monorepos.

**Behavior**: 
- Uses `${branch}` placeholder which gets replaced with the branch name
- For linked versions, Release Please creates a single PR for all packages

**Documentation**: [Grouping Pull Requests](https://github.com/googleapis/release-please?tab=readme-ov-file#group-pull-request-title-pattern)

---

### Release Type

```json
"release-type": "node"
```

**Purpose**: Specifies the project type, which determines default behavior for versioning and changelog generation.

**Behavior**: 
- Uses Node.js/npm conventions
- Updates `package.json` version field
- Generates conventional changelog format
- Handles npm-specific files

**Documentation**: [Release Types](https://github.com/googleapis/release-please?tab=readme-ov-file#release-types-supported)

---

### Always Update

```json
"always-update": true
```

**Purpose**: Ensures the release PR is updated with every commit to the main branch.

**Behavior**: 
- Scans commits since last release
- Updates PR description, version numbers, and changelogs
- Prevents stale release PRs

**Documentation**: This is a standard boolean flag in Release Please for keeping PRs current.

---

### Pull Request Header

```json
"pull-request-header": ":tractor: New release prepared"
```

**Purpose**: Customizes the header text in the release PR description.

**Behavior**: 
- Appears at the top of the release PR body
- Can include emojis and markdown
- Provides context to reviewers

**Documentation**: [Pull Request Header](https://github.com/googleapis/release-please?tab=readme-ov-file#pull-request-header)

---

### Prerelease Configuration

```json
"prerelease": true,
"prerelease-type": "alpha",
"release-as": "5.0.0-alpha.0"
```

**Purpose**: Configures prerelease versioning for alpha/beta releases.

**`prerelease`**: 
- Enables prerelease mode
- Affects version bumping logic
- [Documentation](https://github.com/googleapis/release-please?tab=readme-ov-file#prerelease)

**`prerelease-type`**: 
- Defines the prerelease identifier (alpha, beta, rc, etc.)
- Appended to version: `5.0.0-alpha.0`, `5.0.0-alpha.1`, etc.
- [Documentation](https://github.com/googleapis/release-please?tab=readme-ov-file#prerelease-type)

**`release-as`**: 
- Forces the next release version
- Used for major version bumps or initial releases
- Takes precedence over conventional commit version bumps
- [Documentation](https://github.com/googleapis/release-please?tab=readme-ov-file#release-as)

---

### Packages

```json
"packages": {
  "packages/logger": {
    "component": "logger"
  },
  "packages/cli": {
    "component": "cli",
    "extra-files": ["npm-shrinkwrap.json"]
  }
}
```

**Purpose**: Defines which packages in the monorepo should be managed by Release Please.

**Structure**:
- **Key**: Path to package directory (relative to repo root)
- **`component`**: Name used in changelog and release notes. Avoid scopes (@ui5) as it might tag something wrongly on GitHub
- **`extra-files`**: Additional files to version bump (beyond `package.json`)

**Behavior**:
- Each package gets its own changelog
- Only specified packages are included in releases

**Documentation**: [Monorepo Support](https://github.com/googleapis/release-please?tab=readme-ov-file#monorepo-support)

**Note**: We explicitly configure packages instead of using `exclude-paths` because:
1. More maintainable - clear list of released packages
2. Prevents accidental inclusion of internal tooling
3. Better for documentation and understanding

---

### Plugins

```json
"plugins": [
  {
    "type": "node-workspace",
    "merge": false
  },
  {
    "type": "linked-versions",
    "groupName": "ui5-cli-packages",
    "components": ["logger", "fs", "builder", "server", "project", "cli"]
  }
]
```

**Purpose**: Extends Release Please functionality with additional behaviors

#### `node-workspace` Plugin

```json
{
  "type": "node-workspace",
  "merge": false
}
```

**Purpose**: Automatically updates workspace dependency versions in `package.json` files

**Behavior**:
- Scans all `package.json` files in the workspace
- Updates `dependencies` and `devDependencies` when workspace packages are bumped
- `merge: false` updates versions, but doesn't merge PRs automatically

**Known limitations**:
- Cannot resolve circular peer dependencies (e.g., `@ui5/project` ↔ `@ui5/builder`)
- May update lockfile entries for npm aliases incorrectly

**Workaround**: We manually update circular peer dependencies in the workflow after Release Please runs.

**Documentation**: [Node Workspace Plugin](https://github.com/googleapis/release-please/blob/main/docs/plugins.md#node-workspace)

---

#### `linked-versions` Plugin

```json
{
  "type": "linked-versions",
  "groupName": "ui5-cli-packages",
  "components": ["logger", "fs", "builder", "server", "project", "cli"]
}
```

**Purpose**: Synchronizes version numbers across multiple packages in a monorepo

**Behavior**:
- All specified components get the same version number
- Single release PR created for all packages
- Single GitHub release created for the group
- Changelogs are still separate per package

**Benefits**:
- Simplifies versioning for tightly coupled packages
- Easier for consumers to know compatible versions
- Reduces release management overhead

**Documentation**: [Linked Versions Plugin](https://github.com/googleapis/release-please/blob/main/docs/plugins.md#linked-versions)

---

### `changelog-sections`

```json
"changelog-sections": [
  {
    "type": "feat",
    "section": "Features"
  },
  {
    "type": "fix",
    "section": "Bug Fixes"
  },
  {
    "type": "docs",
    "section": "Documentation",
    "hidden": true
  }
]
```

**Purpose**: Defines which commit types appear in the changelog and how they're grouped

**Structure**:
- **`type`**: Conventional commit type (feat, fix, docs, etc.)
- **`section`**: Heading in the changelog
- **`hidden`**: If `true`, commits won't appear in changelog but may still trigger version bumps

**Behavior**:
- Only configured types are included
- Types can be reordered by array position
- Hidden types are useful for internal changes (tests, CI, etc.)

**Documentation**: [Changelog Sections](https://github.com/googleapis/release-please?tab=readme-ov-file#changelog-sections)

**Our Configuration**:
- **Visible**: Features, bugfixes, performance improvements, dependencies, reverts
- **Hidden**: Documentation, styles, refactoring, tests, build, CI, release
