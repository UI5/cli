// Forces the polling watcher for the importing test file. Re-init tests subscribe and unsubscribe
// many overlapping native @parcel/watcher handles during teardown, hitting a native data race that
// crashes the worker with an access violation (0xC0000005 on Windows) on exit; see
// parcel-bundler/watcher#259. Polling avoids the native watcher.
// Scoped per-file so other server tests still cover the native watcher.
process.env.UI5_WATCH_MODE = "polling";
