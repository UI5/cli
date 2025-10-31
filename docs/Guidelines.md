# Development Conventions and Guidelines
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

- required: every commit message has to start with a lowercase `type`. The project has defined a set of [valid types](../commitlint.config.mjs#L10)
  - Note that the types `feat`, `fix`, `perf`, `deps`, and `revert` will appear in the public changelog of the released packages
- required: the `scope` is required for changes that will appear in the public changelog. The scope must be the package folder name (e.g. `cli`, `builder`, ...). Other scopes are not allowed.

- required: the `description` has to follow the Sentence Case style. Only the first word and proper nouns are written in uppercase.


Rules (for commitlint checks)
- Require a scope for all types that appear in the commit message (TBD: what about deps?)
- Limit the scope to the package folder names (cli, builder, ..., incl. documentation)
- 


#### Examples

```
feat(cli): Add "versions" command
```

```
fix(fs): Correctly handle paths containing non-ASCII characters on Windows
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
feat(builder): Implement new build option processing
feat(fs): Add helper methods for new build option
```

For refactoring across packages:
```
refactor: Standardize error handling across packages
```
