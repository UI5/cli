# Development Conventions and Guidelines
## JavaScript Coding Guidelines
We enforce code style rules using [ESLint](https://eslint.org). Execute `npm run lint` to check your code for style issues.  
You may also find an ESLint integration for your favorite IDE [here](https://eslint.org/docs/user-guide/integrations).

## Testing
Unit testing is based on the [ava](https://github.com/avajs/ava) test-framework. You can run all tests using `npm test` (this is what our CI will do for all pull requests).

During development, you might want to use `npm run unit` or `npm run unit-watch` (re-runs tests automatically after file changes) to quickly execute all unit tests and see whether your change just broke one of them. 😉

## Git Guidelines
### No Merge Commits
Please use [rebase instead of merge](https://www.atlassian.com/git/tutorials/merging-vs-rebasing) to update a branch to the latest main. This helps keeping a clean commit history in the project.

### Commit Message Style
#### Commit Summary
The commit summary is the first line of the commit message.

- It should be **50-70 characters** long.
- It must be **prefixed** by `[FIX]`, `[FEATURE]` or `[INTERNAL]` accordingly, followed by the name of the component or module which was the main subject of the change.
    + Use `[FIX]` for bugfixes.
    + Use `[FEATURE]` for new features / enhancements.
    + Use `[BREAKING]` for breaking / incompatible changes.  
      _**Note:** The commit body of a breaking change should also include a paragraph starting with `BREAKING CHANGE:`.  
      This paragraph will be highlighted in the changelog._
    + Use `[DEPENDENCY]` for dependency updates that should be mentioned in the changelog.
    + Use `[INTERNAL]` for all other changes (e.g. refactorings, documentation, etc.). These changes will not be listed in the changelog.
    + Exceptions are changes created by automated processes like releases or dependency updates
- It must not contain `[` or `]` anywhere but in the prefix.
- It shall be written in **imperative present tense** (as recommended by [Git](https://git-scm.com/book/en/v2/Distributed-Git-Contributing-to-a-Project))  
    + Examples: Instead of *"Adding tests for"* or *"I added tests for"* use *"Add tests for"* or *"Add feature xy"*.

#### Commit Body
After the commit summary there should be an empty line followed by the commit body.

- Describe the intention and reasoning of the change
- If a change fixes an issue reported on GitHub, add the following line to the commit message:
    + `Fixes: #<issueNumber>` (e.g. `Fixes: #42`)
- Breaking changes should include a paragraph starting with `BREAKING CHANGE:`. This paragraph will be highlighted in the changelog.

#### Example
```
[FIX] npm translator: Correct handling of devDependencies

- devDevependencies should only be included in certain cases
- Was caused by a refactoring

Fixes: #42
Fixes: #45
```

## Work on Release Branches
Major releases are typically prepared on dedicated branches like `next`.

There are some things to be aware of when working on these branches.

### Implementing Changes in Multiple Code Lines
While working on a new major release (e.g. `5.0.0`), any fixes or new features implemented on the **current** (main) code line (e.g. 4.x) should be cherry-picked as `[INTERNAL]` to the dedicated (pre-)release branch (typically `next`). This is to prevent changes declared as `[FEATURE]` or `[FIX]` from appearing in the changelog twice, which can be confusing since the new major version has not yet been released and should naturally contain any fixes or features released in any of the preceding releases. Listing them twice might confuse users. Note that our changelog is generated based on all tags of the repository, independent of the currently checked out branch (also see [git-chglog/issues/123](https://github.com/git-chglog/git-chglog/issues/123)).

However, once a new major release becomes **current** (i.e. "main", not a pre-release), any changes applied to multiple code lines should be cherry picked with the original prefix, so that they appear for multiple versions in the changelog.
