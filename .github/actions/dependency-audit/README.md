# Dependency security audit

Audits UI5 projects for vulnerable dependencies with [`audit-ci`](https://github.com/IBM/audit-ci),
from three places — **local shell, GitHub Actions, and Jenkins** — using one set of scripts.

Two kinds of target are audited and reported **separately**:

- **Repositories** — a checked-out repo, in three scopes: `locked` (`npm ci`), `devprod`
  (`npm install`, lockfile ignored), and `prod` (`--skip-dev`).
- **npm packages** — the latest published versions consumers actually install (e.g. `@ui5/cli@^4`,
  `@ui5/cli@next`), each installed into a throwaway project outside the repo and audited there.

## Rationale

- **Layered.** Three layers that change for different reasons:
  *audit* (produce results), *format* (render), *orchestration* (decide what to run and whether to
  fail). The audit scripts carry no platform assumptions, so the same code runs everywhere.
- **Never fail + a separate gate.** `audit-*` scripts always exit 0 and write results; `gate.mjs`
  alone decides build pass/fail. This is why the **summary is always produced** even when findings
  exist — the report is written before (and independently of) the failure. On GitHub, a step that
  writes `$GITHUB_STEP_SUMMARY` and then exits non-zero never renders its summary, so separating the
  two is essential, not cosmetic.
- **A plain results directory is the only contract.** Each audit writes
  `<kind>/<slug>.json` + `.log` and one `manifest.jsonl` line. Formatters and the gate read that;
  they never re-run audits.
- **Node.js, zero dependencies.** The work is ~80% JSON shaping — a job
  for `JSON.parse`/`Map`/`.sort`, not `jq`+`awk`. One language, no extra system tools, and the
  scripts use only Node built-ins so they run unchanged inside other repos and throwaway dirs
  (`audit-ci` itself is fetched via `npx`).
- **One target list (DRY).** `targets.json` feeds the scheduled run, the manual run, and Jenkins —
  no list is written twice.
- **GitHub: parallel matrix + always-present summary.** Each target is its own job (`fail-fast:
  false`), so targets fail independently; a final `summary` job (`if: always()`) merges every job's
  artifact into one consolidated report.
- **Severity level is explicit.** `audit-ci` reports nothing unless given a level. Repos use their
  own `audit-ci` config; standalone npm audits (no config) pass `--low` to match.

## Running it

### GitHub Actions
- **Scheduled** (`.github/workflows/security-audit-scheduled.yml`) — daily, all targets.
- **Manual** (`.github/workflows/security-audit.yml`) — `workflow_dispatch`; tick the targets to run.

Both call the reusable engine (`security-audit-reusable.yml`); the report appears in the run's
**Summary** tab, and the run fails if any target has findings.

### Jenkins
`Jenkinsfile` (repo root) mirrors the scheduled run using the same scripts and `format-cli.mjs`.
Requires `git` and Node.js (`^22.20 || >=24`) on the agent.

### Locally

Audit everything in `targets.json` (clones repos + installs published packages — slower):

```bash
R=/tmp/audit-results
node .github/actions/dependency-audit/scripts/audit-all.mjs \
  --targets .github/actions/dependency-audit/targets.json --results "$R"
node .github/actions/dependency-audit/scripts/format-cli.mjs --results "$R"
node .github/actions/dependency-audit/scripts/gate.mjs --results "$R"   # exit 1 if findings
```

Audit a single published package (fast):

```bash
R=/tmp/audit-results
node .github/actions/dependency-audit/scripts/audit-npm.mjs --label "CLI v4" --results "$R" "@ui5/cli@^4.0.0"
node .github/actions/dependency-audit/scripts/format-cli.mjs --results "$R"
```

Audit the repo you are standing in (run from the repo root):

```bash
R=/tmp/audit-results
node /path/to/ui5-cli-mono/.github/actions/dependency-audit/scripts/audit-repo.mjs --label "my-repo" --results "$R"
node /path/to/ui5-cli-mono/.github/actions/dependency-audit/scripts/format-cli.mjs --results "$R"
```

## Adding a target

Edit `targets.json` (add a `repos[]` or `npm[]` entry with a unique `id`). The scheduled run and
Jenkins pick it up automatically. For the manual workflow, add a matching boolean input in
`.github/workflows/security-audit.yml`.
