# Implementation Plan: Step-Based Build Tasks (Phase B)

Phase B is deferred until Phase A (`0019-implementation-phase-a.md`) has landed and settled. It promotes each step to its own pipeline stage, removing the per-step sub-cache that Phase A keeps as a mechanism folded inside a single task stage. Do NOT start Phase B before Phase A is merged and its integration tests are green.

Branch: `feat/step-cache-api-redesign` (or a follow-up). Same constraints as Phase A: breaking changes fine, do NOT bump `CACHE_VERSION`, cache metadata free, no RFC references in code/commits, architecture changes go in the `incremental-build` skill.

## Why Phase B exists

After Phase A, per-step caching lives in the step runner as an internal per-key delta folded into one task stage, running in parallel to the pipeline's stage machinery. Steps and stages are two granularities doing the same job. Because steps exist only on this development branch, folding steps into the stage concept removes the parallel mechanism and shrinks the eventual diff against the released baseline. The end state: every scalar step is a plain stage; every map step is a single stage that carries an internal key-delta (keys never become stages).

## Prototype first (the gating risk)

The result-stage signature is computed as a cartesian product over per-stage candidate signatures (see `ProjectBuildCache` `#getResultStageSignature` and the stage-signature machinery; read the "Signatures" section of the skill's `architecture.md`). Splitting a task into N stages adds factors to that product. Before committing to the refactor:

1. Measure the product's growth on a realistic project (a framework library with `minify` + `buildThemes` + `generateThemeDesignerResources`) under a broad dependency change read by many steps.
2. Confirm the product only grows over stages carrying a dependency delta (so a typical incremental build stays small), or bound it if it does not.

If the growth is unacceptable, keep map steps as single stages (already the plan) and consider keeping scalar steps folded too, i.e. a partial Phase B. Record the measurement in the skill.

## Why a map step stays one stage

Promoting each key to a stage would put the key count into the cartesian product and require the full stage set to be known before execution, which conflicts with keys being discovered at runtime by `keys()`. A map step as a single stage with an internal key-delta keeps the stage set static and knowable from the factory, and keeps keys out of the product. This constraint is fixed; only scalar-step promotion is in question.

## Scope of the refactor

The "one task = one stage" assumption is wired through several places in `packages/project/lib/build/`. Expect to touch:

- Stage naming and stage creation from the task list (`ProjectResources` / `Stage`, and where `initStages` is called).
- Per-task cache validation and recording (`ProjectBuildCache.prepareTaskExecutionAndValidateCache`, `recordTaskResult`), which become per-stage (per-step).
- The current-stage-signature map and the result-metadata import.
- The result-stage signature (the cartesian product above).
- The step runner: instead of folding steps into one task stage, it drives one stage per scalar step and one stage per map step, reusing the existing stage-cache, tag-replay, and CAS-return machinery per stage rather than through the fold.
- The reader stack: more stages means a deeper prioritized reader stack; confirm ordering still gives each step the cumulative output of earlier steps.

## Sequencing

1. Prototype and measure the result-stage signature (above). Land nothing else until this is decided.
2. Introduce stage-per-scalar-step behind the step runner, keeping map steps as single stages. Adjust stage naming/creation, per-stage validation/recording, and the result signature. Migrate the fold-up call sites in `TaskRunner` and `ProjectBuildCache`.
3. Remove the now-dead per-step sub-cache fold from the step runner and `TaskRunner` (the `getResourceRequests`/`getInputRecording`/`getStaleOutputs` fold that Phase A relies on).
4. Update the `incremental-build` skill `architecture.md`: the caching model section, the stage-pipeline section, the persistent-format tables, and the pattern list, to describe one stage per step.

## Testing

Same targets as Phase A (`ProjectBuilder.caching.integration.js`, `BuildServer.integration.js`) plus any stage-signature unit tests. The critical checks are on second/third incremental builds after file changes: a scalar step whose input did not change must be restored (not re-run) as its own stage, and a broad dependency change must not blow up the result-stage signature beyond the measured bound.

## Definition of done

Every step is a stage (scalar) or a single stage with internal key-delta (map); the per-step sub-cache fold is gone; the result-stage signature growth is measured and bounded; the diff against the released baseline is smaller than Phase A left it; the skill reflects the unified model; `npm test` passes.
