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

- required: every commit message has to start with a lowercase `type`. The project has defined a set of [valid types](../commitlint.config.mjs#L10).
- optional: the `scope` is typically the affected module. If multiple modules are affected by the commit, skip it or define a meaningful abstract scope.
- required: the `description` has to follow the Sentence Case style. Only the first word and proper nouns are written in uppercase.
