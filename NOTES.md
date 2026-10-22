# Build cache: tracking a task's code/tool dependencies

**CPOUI5FOUNDATION-1386** — design review for the FND team.

---

## TL;DR

- **Problem.** The build cache ignores the *external tools* a task loads to transform content
  (`buildThemes` -> less-openui5, `minify` -> terser, `jsdoc` -> jsdoc). Bump less-openui5 *without* a
  new `@ui5/builder` release and `ui5 serve` serves CSS compiled by the old version — a stale cache hit.
- **Recommendation.** Per stage: **observe** which tool packages the task actually loads (module-resolution
  hook in the worker, prune the `@ui5/*` framework subtrees), then **content-hash those files** into the
  stage signature via a dedicated `tool-content` request — reusing the existing `HashTree` machinery. No
  version strings, no per-task declaration.
- **Why this one.** It fails **safe** (worst case is a spurious rebuild of one stage, never stale output),
  needs **no annotation** to maintain, is **strictly correct** (also catches `file:` / `link:` / patched
  tools), and is **cheap** (measured: sub-ms warm lookup, single-digit-ms hash).
- **Decisions we want from the team.**
  1. Content-hash over versions-only (strictly more correct; cost measured negligible).
  2. A dedicated `tool-content` signature component vs. folding into `rootSignature`.
  3. Green-light the record-side worker instrumentation (`module.registerHooks` in the two workers).

---

## The problem

A build task loads an external tool and uses it to produce output. The tool's **version is an input** —
a new less-openui5 can compile different CSS from unchanged `.less` sources — but the cache never sees it.

The build signature already folds the `@ui5/builder` / `@ui5/fs` / `@ui5/project` versions, so a code
change *inside* those ships as a new `@ui5/builder` version and invalidates the cache. The gap is their
**dependencies**: less-openui5 is a dep of `@ui5/builder`, so bumping less-openui5 alone — no new builder
release — leaves every signature unchanged. Cache hit, stale output.

**Canonical example:** `.less` unchanged, less-openui5 upgraded to a version that compiles different CSS,
no new `@ui5/builder` release -> the build ships CSS from the old less-openui5.

**Scope:** external deps outside `@ui5/builder` / `@ui5/project` / `@ui5/fs`. Target tasks: `buildThemes`
(less-openui5), `minify` (terser), `jsdoc`.

---

## Options: Scoping — which packages belong to a stage?

Three options for answering: *given a running stage, which external tool packages should the cache track?*
The question is purely about **scoping** — none of the three says anything yet about how to detect a change
once the set is known (that's the hashing section below).

| | 1 — Declaration | 2 — package-lock | 3 — registerHooks (chosen) |
|---|---|---|---|
| How | task declares its tools | parse the lockfile | observe module resolution |
| Scope | per task, manual | whole project tree (can't narrow) | per stage (exactly what loaded) |
| Failure mode | **unsafe** (stale) | safe but coarse | safe (over-capture) |
| Needs a prior build | no | no | yes (record pass) |
| Maintenance | high, rots | none | none |
| Custom tasks (1396) | author must declare | — | free |

- **Option 1** rejected: a forgotten/stale declaration silently serves stale output — the ticket's own
  bug, no backstop.
- **Option 2** rejected as a scoping mechanism: the lockfile is the whole tree, so it can't say which deps
  belong to a stage; also fragile (absent / format varies across npm/yarn/pnpm).
- **Option 3** chosen: observes exactly what each stage loads, no declaration, extends to custom tasks for
  free. Cost: complexity + a prior run; out-of-process tools (jsdoc) handled separately.

**-> Option 3.**

---

## Hashing approach — what to fold per dependency

Once the scoped package set is known (from Option 3), the cache still needs a value to fold per package so
it can detect changes. Two approaches:

| | Version string | Content-hash (chosen) |
|---|---|---|
| Detects a registry version bump | yes | yes |
| Detects `file:` / `link:` / patched tool (no version move) | **no** | **yes** |
| What's needed | specifier-authority mapping, re-resolution | reuses `HashTree`; a `tool-content` request type |
| Cost (measured) | a few `package.json` reads | sub-ms warm stat, single-digit-ms hash |

A content hash **subsumes** the version — any version bump is a content change, and content-hash also
catches the cases version strings miss. Tracking versions alongside hashes is redundant.

**-> Content-hash. Drop version tracking.**

---

## Recommended design

Two halves, split by where the complexity lands:

**Scope (record side, in the worker).** `module.registerHooks({resolve})` observes which modules a stage
loads. Build the import graph from `ctx.parentURL`, treat `@ui5/fs` / `@ui5/project` / `@ui5/logger` as
**barriers** (prune their subtrees — their effect is already covered, see Appendix B), traverse *through*
`@ui5/builder` to reach the tools. Validated: this collapses `buildThemes` from 38 resolved packages to
the 2 that are actually the tool.

**Fold (content hash).** Content-hash the surviving tool files into the stage signature as a dedicated
`tool-content` request, reusing the existing `HashTree` / tiered `isResourceUnchanged` / full-refresh
machinery. No version strings, no re-resolution. jsdoc is out-of-process (can't be observed), so its
package files are hashed from the statically-known `jsdoc` root instead.

Why these properties matter for a cache:

| Property | Why it matters |
|---|---|
| **Fails safe** | A wrong guess is a spurious rebuild of one stage, never stale output. Option 1 could serve stale. |
| **No declaration** | Nothing to forget or let rot; custom tasks (1396) get it for free. |
| **Strictly correct** | Content catches version bumps *and* `file:` / `link:` / patched tools. |
| **Cheap** | Measured: tool packages are tens of files; sub-ms warm stat, single-digit-ms hash. |
| **Reuses machinery** | `tool-content` is just another resource index; no new signature concept. |

---

## How it works: `npm install` then `ui5 serve`

The cold build **records** each stage's tool file set (tool runs in the worker, the hook observes the
loads) and content-hashes it. The warm build only **re-checks** those files with the tiered stat
(re-hash on change) — detecting a tool change **without loading the tool**.

### Initial build (cold cache)

```mermaid
flowchart TD
    A[ui5 serve] --> B[reader request]
    B --> C[ProjectBuilder builds project]
    C --> D{for each stage}
    D --> E[prepareStageExecutionAndValidateCache]
    E --> F{stage cache exists?}
    F -->|no, cold| G[execute stage]
    G --> H["tool loads in worker<br/>registerHooks 'resolve' records<br/>resolved file paths + parent/child edges"]
    H --> I["build import graph<br/>prune @ui5/* barrier subtrees"]
    I --> J["pruned tool file set"]
    J --> K["recordStageResult:<br/>register as tool-content requests<br/>content-hash into stage signature"]
    K --> L[store in StageCache + SQLite]
    L --> D
    D -->|all stages done| M[store result signature]
    M --> N[serve output]
```

### Warm cache (after `npm install`)

```mermaid
flowchart TD
    A["npm install (may bump / patch / relink a tool)"] --> B[ui5 serve]
    B --> C[reader request]
    C --> D[ProjectBuilder]
    D --> E{for each stage}
    E --> F[prepareStageExecutionAndValidateCache]
    F --> G["compute stage signature:<br/>projectIdx . depIdx . input . root . tool-content"]
    G --> H["tool-content component:<br/>tiered stat of recorded tool files<br/>re-hash only on change, tool never loaded"]
    H --> I{stage signature matches stored?}
    I -->|tool files unchanged| J["CACHE HIT<br/>restore cached output + replay tags<br/>processor module stays unloaded"]
    I -->|a tool file changed| K["MISS, re-run stage (cold path)<br/>re-record + store"]
    J --> E
    K --> E
    E -->|done| L[serve output]
```

| What `npm install` changed | Result |
|---|---|
| Nothing relevant | Full cache hit -> serve instantly, zero task execution |
| A tracked tool (bump, patch, or relinked `file:` / `link:`) | Only that stage's `tool-content` component shifts -> only that stage re-runs; others stay cached |
| Source files | Resource-index delta (existing mechanism) -> affected stages re-run, orthogonal |

---

## Scenarios

Concrete triggers and the cache behavior each must produce — doubles as the acceptance / test matrix.

### A. The bug, and basic cache correctness

| Scenario | Expected | Mechanism |
|---|---|---|
| less-openui5 bumped via npm, no `@ui5/builder` release (**the ticket**) | buildThemes re-runs, fresh CSS | content-hash of less-openui5 files |
| `ui5 serve` again, nothing changed | full cache hit, zero task execution, tool never loaded | tiered stat, all signatures match |
| a `.less` source edited | buildThemes re-runs; tool unchanged | resource index (existing), orthogonal |

### B. What content-hash catches that versions-only would miss

| Scenario | Expected | Mechanism |
|---|---|---|
| less-openui5 `npm link`ed, a source file edited, version unchanged | buildThemes re-runs | content-hash (version wouldn't move) |
| `patch-package` patches terser, version unchanged | minify re-runs | content-hash (version wouldn't move) |
| transitive dep bumped (`@adobe/css-tools` under less-openui5), less-openui5 unchanged | buildThemes re-runs | content-hash of the tool subtree (not pruned) |

### C. Scoping correctness

| Scenario | Expected | Mechanism |
|---|---|---|
| terser bumped | only minify re-runs; buildThemes stays cached | per-stage `tool-content` isolation |
| fast-glob bumped (dep of `@ui5/fs`), no `@ui5/fs` release | buildThemes does **not** re-run from tool-content (safe: fast-glob's effect is resource-mediated, caught by the resource index if it matters) | barrier prune (`@ui5/fs` subtree excluded) |
| `workerpool` bumped (builder plumbing) | minify re-runs needlessly | accepted residual over-capture (correctness-safe) |

### D. Lifecycle, jsdoc, and known gaps

| Scenario | Expected | Mechanism |
|---|---|---|
| `npm ci`, same versions (mtimes move, content identical) | one re-hash, **no** re-run | tiered `isResourceUnchanged` (integrity matches) |
| a task stops loading a tool | `tool-content` set shrinks -> re-runs once, then stable | recorded set shrinks |
| first build, cold cache | records each stage's tool files; discovers the set on first run | record pass |
| `npx` / global install (tool files outside the project tree) | still tracked | dedicated `tool-content` adapter reaches them |
| jsdoc package bumped | jsdoc stage re-runs | static content-hash of the `jsdoc` package |
| jsdoc *transitive* dep bumped, jsdoc unchanged | **not** caught (unless the static dep-walk is added) | known narrowing (Appendix E) |
| tool package with non-deterministic content (postinstall-generated) | cache not portable across machines | out of scope (documented) |

### Sample fixtures

Three sample projects exercise the three tools; scenarios are produced by manipulating their installed
tool packages under `node_modules`.

- **theme-lib** — a library with `src/.../themes/base/library.source.less` -> `buildThemes` + less-openui5
  (scenarios A1-A3, B1, B3, C2).
- **minify-app** — a project with non-trivial `.js` -> `minify` + terser (B2, C1, C3).
- **jsdoc-lib** — a library whose `api.json` is generated -> `jsdoc` (D5, D6).

Tool-state manipulations (each a reusable test setup against a sample's `node_modules`):

- **bump** — `npm i less-openui5@<newer>`, or edit the installed `package.json` version plus one source line.
- **link** — `npm link` / a `file:` dep, then edit a source file (no version change).
- **patch** — `patch-package`, or a manual edit to one installed file.
- **transitive bump** — an `overrides` entry (e.g. `@adobe/css-tools`).
- **barrier bump** — edit a file under `@ui5/fs`'s `fast-glob` (expect no buildThemes re-run).
- **reinstall** — `npm ci` with the lockfile unchanged (mtimes move, content identical).
- **relocate** — run via `npx` / a global `@ui5/cli` so the tool files sit outside the project tree.

---

## Implementation plan

| Phase | What | Standalone? |
|---|---|---|
| 1 | **Recorder** — `registerHooks({resolve})`, record resolved file paths + parent/child package edges, scoped per stage | yes, unit-testable |
| 2 | **Graph + prune** — build the DAG, prune `@ui5/*` barriers, output the stage's tool file set | yes, unit-testable |
| 3 | **Wire in** — register in `themeBuilderWorker.js` + `minifierWorker.js` + main; drain the set back with the worker result | — |
| 4 | **Fold** — dedicated `tool-content` request type + adapter + signature component (Appendix D) | — |
| 5 | **jsdoc** — content-hash the statically-known `jsdoc` package files (out-of-process, Appendix E) | — |
| 6 | **Verify** — overhead, async-interleaving attribution, full suite on real Node 22/24 | — |

**Residual decision (parked, Appendix C/decision 7):** after pruning, builder plumbing like `workerpool`
is still hashed (the loader can't tell plumbing from tool). Accepted — it's correctness-safe over-capture;
a central denylist is the lever if it ever proves noisy.

**Out of scope:** non-deterministic package content (postinstall-generated files — a portability edge);
out-of-process transitive deps of jsdoc unless the static dep-walk is added; custom tasks (follow-up 1396).

---

## Appendix A — Validation findings (checked with spikes, not assumed)

1. **`module.registerHooks` available** on Node 26 and the engines range (`^22.22.3 || ^24.15.0 || >=26`;
   API shipped 22.15 / 23.5).
2. **Tools load in worker threads; hooks are per-thread.** A main-thread hook is blind to a worker's
   imports; register **inside the worker**.
3. **Record via `resolve`, not `load`.** The import cache suppresses `load` after the first loader (1 of 3
   imports); `resolve` fires every time (3 of 3), cache-proof.
4. **Path -> package needs specifier authority.** terser ships `dist/package.json` named `"dist"`, so the
   naive "nearest named `package.json`" mis-reads it. (Moot under content-hash — see Appendix D — it only
   affects barrier identity, where a mis-map is a harmless over-capture.)
5. **The flat resolved set is framework-dominated.** A real `buildThemes` run resolves 38 packages; only 2
   are the tool. The other 36 are `@ui5/fs` + its closure (fast-glob, micromatch, ...).
6. **`ctx.parentURL` present on every `resolve`,** so the import graph is reconstructable. Pruning `@ui5/*`
   barriers collapses buildThemes 36 -> 2; minify -> 7 (terser + five `@jridgewell/*` + residual
   `workerpool`).
7. **jsdoc runs out-of-process** (`jsdocGenerator.js` does `spawn("node", …)`). A hook in the build process
   can't see the child; the only uncovered tool is the `jsdoc` package itself (its UI5 plugin/template are
   builder code, already covered).

## Appendix B — Why prune, not track the whole tree

Tracking the whole tree sounds safer but is wrong: an input earns tracking only when its change isn't
already observed elsewhere, and most of the tree is. The **resource Merkle indices** already capture
anything whose effect reaches the build through resource content/existence — the entire `@ui5/fs` layer
acts this way. The **project build signature** already folds the `@ui5/{builder,fs,project}` versions. The
ticket's gap is narrow: a **content-transform tool** reads unchanged input and emits different output —
invisible to the resource index. Pruning the `@ui5/fs` subtree removes redundant coverage, not real
coverage. The tool's own transform deps are *not* pruned (they're in the tool subtree), so an overridden
`postcss` under less-openui5 is still caught.

**Prune by reachability, not by node identity.** A package is in the tool set iff it is reachable from
`@ui5/builder` via a path that never crosses a barrier: BFS from `@ui5/builder`, and when a barrier node
(`@ui5/{fs,project,logger}`) is hit, keep it but **don't expand it** — every other edge is still traversed.
This matters when a package `P` is a dependency of *both* the tool and a barrier (a diamond): because `P`
retains a tool-side path, it stays tracked — reachability through the tool wins over the pruned barrier
edge. If npm instead nested two copies of `P` (version conflict), each resolves to a distinct physical path
and is pruned independently, so the tool's copy is kept and the barrier's copy dropped. This falls out for
free because the hash is keyed on **resolved physical paths**, not package names. The danger would be
node-first pruning (marking everything under a barrier as excluded up front), which would wrongly drop a
shared `P` and risk stale output; a BFS that merely refuses to expand barrier nodes cannot — its worst case
is over-capture (one spurious rebuild), never under-capture.

## Appendix C — Options, in detail

Options 1-3 are about **scoping** (which packages belong to a stage). Content-hash vs versions is the
separate **hashing** question addressed in the dedicated section above.

- **Option 1 — Declaration.** Deterministic, no hooks, uniform across in/out-of-process. Decisive con:
  **unsafe failure mode** — a forgotten/stale declaration -> stale stage, no backstop; burden lands on
  custom-task authors.
- **Option 2 — package-lock.** Exact versions + integrity, transitive tree present. Decisive con: **can't
  scope** (folding the whole tree keys the cache on every dep); also fragile (absent / format varies).
- **Option 3 — registerHooks.** Scopes precisely for free; safe; extends to custom tasks. Con: complexity
  and needs a prior run; doesn't cover out-of-process tools (jsdoc handled separately).
- **Content-hash feasibility** — measured on the real tools:

  | | files | size | hash | stat (warm lookup) |
  |---|---|---|---|---|
  | terser | 43 | 2.3 MiB | ~40 ms cold / ~2 ms warm | 0.2 ms |
  | less-openui5 | 63 | 0.35 MiB | ~26 ms cold / ~2 ms warm | 0.2 ms |

  Pruning keeps the set to tens of files, so warm lookup is sub-ms (tiered stat) and a full hash is
  single-digit-ms. Caveats (none decisive): redundant-but-cheap for registry installs; one re-hash after a
  same-version `npm ci` (no false re-run); non-deterministic package content hurts portability (rare).

- **Residual (decision 7):** builder plumbing (`workerpool`) survives the prune because the loader can't
  tell plumbing from tool. **Accept** (A) — correctness-safe over-capture bounded to one stage; a central
  **denylist** (C) is the safe lever; a per-task **declaration** (B) is rejected (reintroduces the unsafe
  failure mode).

## Appendix D — Why a dedicated `tool-content` request type

Reuse the content-hash *machinery* (`HashTree`, tiered `isResourceUnchanged`, full-refresh), but **not**
the existing `root` requests, for three reasons:

1. **Provenance** — `root` means "files the task read via `getRootReader`"; tool files are runtime-loaded
   modules — a different category, and entangling them loses the distinction.
2. **Reader scope** — the root reader is rooted at the project; under a **global install or `npx`**, the
   tool files live outside the project tree and the root reader can't resolve them.
3. **Gitignore** — `root` splits on `useGitignore`, and `node_modules` is normally gitignored.

So: a dedicated `tool-content` request type with its own adapter (reaching the resolved absolute paths,
gitignore ignored), folded as a **dedicated signature component** (preferred — a factor-1 constant in the
result-stage product, shape bump free while unreleased) or into the `rootSignature` value (acceptable).

**Path form: absolute while recording, package-relative when persisted.** The path wants a different form
at each stage, and persisting the wrong one re-breaks portability:

- **Recorder (in-memory, one run)** emits **absolute** paths — the `resolve` hook yields them and the prune
  needs them, because physical identity is what separates a deduped copy from a nested one (the diamond in
  Appendix B). Transient; nothing absolute survives the run.
- **Index (`stage_request_metadata`)** stores **package-relative** paths plus a re-resolvable tool identity,
  never absolute. An absolute path pins the entry to one machine's layout (`/Users/…` vs `/home/ci/…`,
  local vs global vs `npx`) — the same non-portability the existing cache avoids by excluding the absolute
  `getRootPath`/`getSourcePath` accessors from input tracking. The anchor is each **tool package root**
  (not the project root — under a global/`npx` install the tool sits outside the project tree), so
  less-openui5 persists `["lib/Builder.js", …, "package.json"]`. Paired with the **integrity** (which keys
  the CAS and is portable), the stored `(relative-path, integrity)` tuple is fully portable.
- **Lookup** re-resolves each package anchor to an absolute root and stats the relative set. Re-resolution
  is **parent-relative**: a nested `@adobe/css-tools` under less-openui5 must be resolved *from
  less-openui5's location*, or lookup would stat the hoisted top-level copy instead. So the persisted
  identity is really `(parent chain → package → relative path)` — the same physical identity the absolute
  path gave the recorder, in portable form.

## Appendix E — jsdoc detail

jsdoc is out-of-process (`spawn("node", [import.meta.resolve("jsdoc/jsdoc.js"), …])`), so `registerHooks`
can't observe it. The fold is identical to the in-process tools; only the file set is determined
differently: the `jsdoc` package root is known statically, so register its files as `tool-content`
requests and content-hash them — no version fold, no child instrumentation. Transitive deps aren't
observable out-of-process; a static dep-walk of jsdoc's `package.json` closure would cover them if wanted,
otherwise accept the narrowing (jsdoc's own content only).
