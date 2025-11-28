# Development Conventions and Guidelines
## Local Development Environment
You can use any IDE or text editor of your choice. There are no specific requirements or additions for a certain IDE.

### Prerequisites

- [Node.js](https://nodejs.org/) (See `engines` section in [package.json](../package.json) for the required version)
- [npm](https://www.npmjs.com/) (comes with Node.js)

UI5 CLI is tested on Windows, macOS, and Linux. However, some tools and scripts require a Unix-like shell environment, so we recommend using [Git Bash](https://git-scm.com/install/windows) on Windows.

### Installation

1. Clone the repository and navigate into it:
   ```sh
   git clone https://github.com/UI5/cli.git
   cd cli
   ```
2. Install all dependencies in the repository (npm workspace):
   ```sh
   npm install
   ```
3. *(Optional)* If you want to test the CLI locally, you can link the package to make the `ui5` command available globally:
   ```sh
   npm link --workspace @ui5/cli
   ```
   **Note:** You might need to set the environment variable `UI5_CLI_NO_LOCAL` to `X` (or any value) to avoid invoking a local installation of UI5 CLI in your current working directory.

   You can remove the global link using:
   ```sh
   npm uninstall --global @ui5/cli
   ```
   If you had previously installed UI5 CLI globally using `npm install --global @ui5/cli`, you need to re-install it after removing the link.

## JavaScript Coding Guidelines
We enforce code style rules using [ESLint](https://eslint.org). Execute `npm run lint` to check your code for style issues.  
You may also find an ESLint integration for your favorite IDE [here](https://eslint.org/docs/user-guide/integrations).

## Testing
Unit testing is based on the [ava](https://github.com/avajs/ava) test-framework. You can run all tests using `npm test` (this is what our CI will do for all pull requests).

During development, you might want to use `npm run unit` or `npm run unit-watch` (re-runs tests automatically after file changes; only available within a specific package) to quickly execute all unit tests and see whether your change just broke one of them. 😉

## Git Guidelines
### No Merge Commits
Please use [rebase instead of merge](https://www.atlassian.com/git/tutorials/merging-vs-rebasing) to update a branch to the latest main. This helps keeping a clean commit history in the project.

### Commit Message Style

This project uses the [Conventional Commits specification](https://www.conventionalcommits.org/) to ensure a consistent way of dealing with commit messages.

#### Structure

```
type(scope): Description
```

- **Type (required)**: Every commit message must start with a lowercase `type`. The project has defined a set of [valid types](../commitlint.config.mjs#L10)
- **Scope (conditional)**: Required only for types that appear in the public changelog: `feat`, `fix`, `perf`, `deps`, and `revert`. The scope must be the package folder name (e.g. `cli`, `builder`, `fs`, `logger`, `project`, `server`, `documentation`). No other scopes are allowed (except `build(deps-dev)` for dev dependencies).
- **Description (required)**: Must follow Sentence Case style. Only the first word and proper nouns are written in uppercase.

#### Dependencies

- Use `deps(scope)` for productive dependency updates that are relevant for end users
- Use `build(deps-dev)` for development dependency updates

#### Breaking Changes

Breaking changes should follow the [Conventional Commits specification](https://www.conventionalcommits.org/):
- Add `!` after the type/scope: `feat(cli)!: Remove deprecated command`
- Include `BREAKING CHANGE:` in the commit footer with details about the change

#### Commitlint Rules

The following rules are enforced by commitlint:
- Valid commit types are enforced (see [commitlint.config.mjs](../commitlint.config.mjs))
- When using a scope, it must be one of: package names (`builder`, `cli`, `documentation`, `fs`, `logger`, `project`, `server`) or `deps-dev` for development dependencies
- Commit messages must follow sentence case for the description

**Important**: Commitlint cannot automatically enforce that scopes are required only for public changelog types. Please manually ensure that:
- `feat`, `fix`, `perf`, `deps`, `revert` commits always include a package scope
- Other commit types should not include a scope (except `build(deps-dev)` for dev dependencies) 

#### Examples

**Features and fixes:**
```
feat(cli): Add "versions" command
```
```
fix(fs): Correctly handle paths containing non-ASCII characters on Windows
```
```
perf(builder): Improve bundle generation speed by 25%
```

**Dependencies:**
```
deps(cli): Update @ui5/logger to v4.0.0
```
```
build(deps-dev): Update eslint to v9.0.0
```

**Breaking changes:**
```
feat(cli)!: Remove deprecated "init" command

BREAKING CHANGE: The "init" command has been removed. Use "create" instead.
```

**Workspace-wide changes (no scope):**
```
ci: Update GitHub Actions to use Node.js 20
```
```
docs: Update contribution guidelines
```
```
build: Configure new linting rules
```

### Multi-Package Changes

When making changes that affect multiple packages, create individual commits for each package to maintain clear scoping and changelog generation. Each commit should follow the conventional commit format with the appropriate package scope.

**Exception:** Create a single commit for cross-package changes that do not affect the public changelog, such as:
- Code style updates and formatting changes
- Refactoring that doesn't change public APIs
- Internal tooling and configuration updates
- Documentation updates across packages

#### Examples

For a feature spanning multiple packages:
```
feat(cli): Add support for new build option
```
```
feat(builder): Implement new build option processing
```
```
feat(fs): Add helper methods for new build option
```

For refactoring across packages:
```
refactor: Standardize error handling across packages
```
