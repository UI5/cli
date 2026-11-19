// Worker entry for the worker-only tool-tracking boundary test. The tool (stub-tool) is required ONLY
// here, inside the worker realm the task spawns. The main-thread recorder cannot observe a resolution in
// this realm, so a bump of stub-tool is not reflected in the task's tool-content signature. This is the
// documented limitation in NOTES.md 2.6: a custom task must resolve its tool on the main thread to have it
// tracked.
const {parentPort} = require("node:worker_threads");
const transform = require("stub-tool");

parentPort.on("message", (src) => {
	parentPort.postMessage(transform(src));
});
