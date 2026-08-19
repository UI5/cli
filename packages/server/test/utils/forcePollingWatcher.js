// Forces the pure-JS polling file watcher for the importing test file. Tests that drive real re-init
// swaps against a live graph subscribe and unsubscribe many overlapping native @parcel/watcher handles
// during teardown. @parcel/watcher 2.5.6 has an unsynchronised data race in its process-global
// shared-backend registry (getShared on the JS thread vs. removeShared on a libuv worker; see
// parcel-bundler/watcher#259) that corrupts memory and crashes the worker with an access violation
// (0xC0000005 on Windows) on process exit. The race lives below the JS layer, so a JS-side mutex
// cannot close it; polling avoids the native backend entirely and is a faithful drop-in (same event
// and unsubscribe contract), so the re-init behaviour under test is unchanged.
//
// This is a side-effect-only module: importing it sets the env var. The backend decision reads it
// lazily on the first subscribe (inside a test body), so an import at the top of a test file is in
// time. Scoped per-file rather than global so the other server tests keep exercising the native
// backend.
process.env.UI5_WATCH_MODE = "polling";
