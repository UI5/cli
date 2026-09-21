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
| `transformBootstrapHtml` | `cheerio` | `1.0.0` (pinned) | Stale bootstrap `index.html` (HTML re-serialization) |

Both `buildThemes` and `minify` produce 100% of their output via the processor. A bump within the
semver range (a dedup, a lockfile update, a compiler fix) that changes output does not change
`@ui5/builder`'s version, so the signature is identical and the cached result is reused → stale output
served.

`transformBootstrapHtml` is the same *class* of untracked input, from the opposite end of the range
spectrum: it edits a single attribute, but the surrounding HTML is re-serialized by `cheerio`, so a
`cheerio` change to entity encoding, whitespace, or self-closing-tag handling alters the output. Today
`cheerio` is pinned to an exact version, so it can only change together with an explicit `@ui5/builder`
change (which bumps the builder version and invalidates the signature anyway) — the gap is not
currently *exploitable* here. It is listed because the model must not depend on that pin: the version
is still not folded into the signature, so relaxing the pin to a range would silently reopen the gap.
That is exactly why processor versions belong in the model as declared inputs rather than being kept
safe by hand-maintained pins.

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

## 3. Clock-derived inputs (`${currentYear}`, `${buildtime}`) — undecided

**Status:** open, **undecided**. Raised while analysing `replaceCopyright` for
CPOUI5FOUNDATION-1363. No failing test and no integration yet; `replaceCopyright`
integration is **blocked on this decision**.

A specialization of the §2 non-resource-input class: the input is the wall clock, read *inside*
the task and baked into the output, but never observed by the cache. Two built-in tasks are the
two poles of the question, and it is not yet decided whether either is actually a bug.

**Instances / two poles:**

| Task | Placeholder | Resolved via | Scope | Granularity |
|------|-------------|--------------|-------|-------------|
| `replaceCopyright` | `${currentYear}` | `new Date().getFullYear()` (`replaceCopyright.js:40`) | application + library | year |
| `replaceBuildtime` | `${buildtime}` | `yyyyMMdd-HHmm` timestamp (`replaceBuildtime.js:6-15,44`) | library-only (`Global.js`/`Core.js`) | minute |

Both are `supportsDifferentialBuilds: true` with **no** `determineBuildSignature`, so their
signature is `JSON.stringify(options)` (`TaskDefinitions.js:138-140`) with the clock value
**unresolved** — the raw `copyright` option still contains the literal `${currentYear}`, and
`replaceBuildtime` has no clock-derived option at all. The clock value is therefore never in the
signature: a build cached in year N and reused in year N+1 keeps the stale year; a cached build
reused later keeps the stale timestamp.

**The axes that distinguish them** (analysis, not a verdict):

1. Is the clock value part of the *semantic output the author wants kept current* (`currentYear`
   on a copyright notice), or an *artifact of the build event* — "when this build ran"
   (`buildtime`)? Under the build-event reading, a cache hit means no build ran, so keeping the
   previously-baked value is arguably *correct*.
2. Staleness granularity: **year** (`currentYear`) means folding the resolved value in costs at
   most one forced rebuild per calendar year — cache-friendly. **Minute** (`buildtime`) means
   folding it in makes the signature unique on essentially every build, so the cache could
   **never** hit — folding-in is clearly the wrong model there.

**Three candidate models** (none selected):

1. **Ignore it** (current behavior). Correct under "keep the last build's value"; stale under
   "reflect the wall clock at build time".
2. **Fold the *resolved* value into the signature** (via `determineBuildSignature` as
   `generateJsdoc` does, or a new-system equivalent). Correct invalidation, but poisons the cache
   at fine granularity — acceptable for `currentYear`, fatal for `buildtime`.
3. **Resolve the value *outside* the cached task** (the orchestrator computes it once and passes
   it as an ordinary option) so the task is a pure function of its options and model 2 falls out
   for free. Only sensible when there is a coarse granularity worth forcing a rebuild on —
   plausible for `currentYear`, not for `buildtime`.

**Open questions to resolve later** (explicitly deferred, the user is not ready to decide):

- Is stale clock-derived output on a cache hit a **bug**, or **correct-by-design** (no rebuild
  happened, so the old value legitimately stands)?
- Should a mid-year rebuild triggered by an *unrelated* source change be allowed to flip the
  displayed year, or should the year be "whatever it was when the artifact was first built"?
- Is `replaceBuildtime` in scope for CPOUI5FOUNDATION-1363 at all, or does it "work as designed"?

---

## 4. Resource-tag propagation through the per-invocation layer

**Status:** open. Parked from `minify_v2.js`.

`NewTaskSystem` attributes reads/writes per `forEachResource` invocation, but full resource-tag
propagation through this per-invocation layer is not yet handled. Tags (`IsDebugVariant`,
`HasDebugVariant`, `OmitFromBuildResult`, …) set inside a callback, and tag reads that should
count as inputs, need to flow through the per-invocation attribution and into the hash
signatures the same way direct resource reads do — otherwise a tag-only change can be missed
(or over-invalidate) on delta builds.

---

## 5. `forEachResource` should accept an exact path, not only a glob

**Status:** open. Came out of the `transformBootstrapHtml` pass of CPOUI5FOUNDATION-1363.

`forEachResource(pattern, callback)` currently treats its first argument as a glob and resolves it
via `workspace.byGlob()` on every build (and again, per pattern, during delta selection in
`#selectDeltaResources`). But some tasks address a **single, known resource**: `transformBootstrapHtml`
processes exactly one `index.html` at a namespace-derived path, so it passes that path *as* the pattern
(`/resources/${namespace}/index.html`). Routing a known single path through glob matching is wasteful —
a `byPath()` lookup is a direct hit, whereas `byGlob()` walks the workspace.

**Requirement / improvement.** Let a registration declare that its target is an exact path (or detect
a glob-free pattern) and resolve it via `workspace.byPath()` instead of `byGlob()`, in both the
full-build drive and the delta selection. This is a performance improvement, not a correctness gap —
the current glob path produces the right result — but single-resource tasks are common enough that the
API should express "this one resource" as a first-class case rather than a degenerate glob.

---

## 6. A task's declared pattern matching nothing is currently silent

**Status:** open. Came out of the `transformBootstrapHtml` pass of CPOUI5FOUNDATION-1363.

The pre-`_v2` `transformBootstrapHtml` warned when its `index.html` was missing. In the declarative
model a zero-match pattern is simply a no-op (the callback never runs), so the warning was dropped
during integration. That is the right default — but it removes a task's ability to react when its
declared input is unexpectedly absent (a genuine misconfiguration vs. a legitimately empty match).

**Question for the design.** Should the system offer a task a way to distinguish "matched nothing"
from "matched and processed" — e.g. an optional per-registration hook, or a returned count — so a task
can surface a warning without owning delta/invalidation logic? Deferred: on a delta build a
missing/unchanged resource is normal, so any such signal must be full-build-aware to avoid false
warnings. Left to a later task to reinforce before committing to an API shape.

---

## 7. Reads first observed on a delta build are not folded back into the cache index

**Status:** open. Came out of the `buildThemes` pass of CPOUI5FOUNDATION-1363. Tracked by the
`test.serial.failing` "Build theme.library.e project multiple times" case in
`ProjectBuilder.caching.integration.js`.

**Problem.** `ProjectBuildCache.recordTaskResult` records the task's resource requests into the cached
`ResourceIndex` (via `taskCache.recordRequests`) **only on a full (non-delta) execution**. The delta
branch merges the previous stage and stores the stage under the delta's signature, but never re-records
requests. So a resource a task reads *for the first time during a delta build* — e.g. a new `.less`
file pulled in by an `@import` that was added on that same delta build — is captured by the new task
system's per-invocation reads (used for delta *selection* within the task) but is **not** added to the
task's cached `ResourceIndex`. On the next build, `updateIndices` matches a change to that file against
no recorded request, so the task is considered unaffected and is wrongly skipped → stale output.

The nuance: a first-time read that is *covered by an existing recorded glob* is still tracked (the glob
membership change is observed). Only a read not covered by any recorded request (a `byPath` of a
specific file, or an `@import` outside a recorded glob) is lost.

**Requirement for the new system.** On a delta build, additively fold the newly-observed reads back
into the task's request graph so subsequent builds invalidate correctly. The per-invocation reads the
adapter already persists (`newTaskSystemInvocationDataStore`) are the complete source across builds
(the delta build's own `workspace.getResourceRequests()` only covers re-driven invocations). The merge
must be additive (never a replace) and must not disturb the stage key the delta was cached under
(`cacheInfo.newSignature`). Scope it to new-task-system tasks, like §1's removed-input relaxation.

---

## Notes

- These items were consolidated here from inline `PARKED follow-ups` comments in
  `packages/builder/lib/tasks/minify_v2.js`.
- §1 came out of the buildThemes pass of CPOUI5FOUNDATION-1363; it generalizes the terser case
  minify already exposed, so it is task-agnostic and belongs to the system, not a single task.
- §3 came out of the replaceCopyright pass of CPOUI5FOUNDATION-1363; it is a specialization of
  §2 and is left **undecided** — replaceCopyright integration is blocked on it.
- §5 and §6 came out of the transformBootstrapHtml pass of CPOUI5FOUNDATION-1363.
- §7 came out of the buildThemes pass of CPOUI5FOUNDATION-1363; the removed-input half of the same
  pass was closed (new-task-system tasks now emit removed-resource deltas and drop the outputs an
  invocation no longer produces — see the passing add/remove "buildThemes: ..." caching tests), but the
  grow-input-on-delta half above remains open.
