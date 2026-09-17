# New task system — open gaps and requirements

Tracking doc for the declarative "new task system" prototype (see `NewTaskSystem.js`,
`*_v2.js` tasks). It collects input classes and requirements that the prototype does **not**
yet model, so we don't lose them while integrating tasks one by one (CPOUI5FOUNDATION-1363).

The system's promise is that a task **declares** what it does with which resources and the
system derives cache correctness — a task cannot ship stale output by forgetting to
invalidate. The gaps below are inputs that affect a task's output but are **not** yet
observed by the cache, so they must be brought into the model rather than left to task
authors.

---

## 1. Third-party / processor dependency version is not in the cache signature

**Status:** open, general (affects multiple built-in tasks).

**Problem.** A task's output is often produced by a third-party processor library. When that
library changes version — and its output changes with it — the cache must invalidate. Today
it does not, unless the change happens to coincide with a `@ui5/builder` release.

The project build signature (`getProjectSignature`,
`packages/project/lib/build/helpers/getBuildSignature.js`) folds in processor versions **only**
via `taskRepository.getVersions()` (`packages/builder/lib/tasks/taskRepository.js`), which
returns just `{builderVersion, fsVersion}`. Transitive processor libraries are absent. A task
can add a per-task `determineBuildSignature` (as `generateJsdoc` does for `project.getVersion()`),
but no built-in task folds in its processor's version, and the burden being on the task author
is exactly the failure mode this system is meant to remove.

**Instances (all the same root cause):**

| Task | Processor library | Range in `@ui5/builder` | Effect of a stale cache |
|------|-------------------|-------------------------|-------------------------|
| `buildThemes` | `less-openui5` | `^0.12.0` | Stale CSS / RTL / `library-parameters.json` |
| `minify` | `terser` | `^5.51.2` | Stale minified JS / source maps |

Both produce 100% of their output via the processor. A bump within the semver range (a dedup,
a lockfile update, a compiler fix) that changes output does not change `@ui5/builder`'s version,
so the signature is identical and the cached result is reused → stale output served.

**Why no failing test upfront.** Unlike a resource-tracking gap (e.g. the minify
differential source-map case, which we could reproduce by changing a `.js.map`), this gap has
**no observable input to vary from the outside**: the only signal is the processor library's
version, and the fix *is* the definition of what the test would assert (fold the version into
the signature). A "failing test" would have to stub the processor's output while leaving the
version untracked — but that just re-states the fix, it doesn't exercise a pre-existing
observable behavior. So this is tracked here as a **design requirement**, not a
`test.failing`. The test is written together with the fix: with the processor version folded
into the signature, a version change invalidates the cache; the test asserts that.

**Requirement for the new system.** Treat a processor library's version as a first-class
**non-resource input** of the task (see §2). A task declares which processor(s) it uses; the
system folds their resolved versions into that task's contribution to the signature, without
per-task boilerplate. Bumping `BUILD_SIG_VERSION` / cache version is acceptable when this
lands.

---

## 2. `process.env` (and other non-resource inputs) are not modeled as monitored inputs

**Status:** open. Parked from `minify_v2.js`.

Tasks read `process.env` as an input (e.g. `useWorkers: !process.env.UI5_CLI_NO_WORKERS && !!taskUtil`
in `minify_v2.js` / `buildThemes.js`). Such non-resource, potentially non-deterministic inputs
are not yet modeled as monitored/invalidating inputs. The new system needs a way for a task to
declare a non-resource input (an env var, a config value, a processor version per §1) so that
its value participates in cache correctness rather than being an untracked side channel.

Note: `UI5_CLI_NO_WORKERS` specifically only switches execution locus (worker vs. inline) and
does not change output, so it is not itself a staleness risk — but it is the concrete example
of the untracked-input *shape* the model must handle in general.

---

## 3. Resource-tag propagation through the per-invocation layer

**Status:** open. Parked from `minify_v2.js`.

`NewTaskSystem` attributes reads/writes per `forEachResource` invocation, but full resource-tag
propagation through this per-invocation layer is not yet handled. Tags (`IsDebugVariant`,
`HasDebugVariant`, `OmitFromBuildResult`, …) set inside a callback, and tag reads that should
count as inputs, need to flow through the per-invocation attribution and into the hash
signatures the same way direct resource reads do — otherwise a tag-only change can be missed
(or over-invalidate) on delta builds.

---

## Notes

- These items were consolidated here from inline `PARKED follow-ups` comments in
  `packages/builder/lib/tasks/minify_v2.js`.
- §1 came out of the buildThemes pass of CPOUI5FOUNDATION-1363; it generalizes the terser case
  minify already exposed, so it is task-agnostic and belongs to the system, not a single task.
