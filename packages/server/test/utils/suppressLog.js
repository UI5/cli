// @ui5/logger writes messages straight to process.stderr whenever the corresponding
// process event has no listener attached (see the fallback branches in the loggers
// under @ui5/logger/lib/loggers). Several server tests intentionally exercise error
// and build paths whose logs would otherwise clutter the test output and obscure real
// failures. Attaching a no-op listener to each event with a stderr fallback routes
// those messages to the (ignored) event instead.
for (const event of [
	"ui5.log", // Logger#_emitOrLog
	"ui5.build-status", // loggers/Build
	"ui5.project-build-status", // loggers/ProjectBuild
	"ui5.serve-status", // loggers/Serve
]) {
	process.on(event, () => {});
}
