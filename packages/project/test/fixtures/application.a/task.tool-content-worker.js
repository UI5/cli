const path = require("node:path");
const {Worker} = require("node:worker_threads");
const Logger = require("@ui5/logger");
const log = Logger.getLogger("builder:tasks:toolContentWorkerTask");

// A custom task that loads its tool ONLY inside a worker it spawns itself, with no main-thread resolve of
// the tool. The worker realm is invisible to the main-thread recorder, so the tool is not tracked and a
// bump of it is served from a stale cache. This is the documented known limitation (NOTES.md 2.6): the
// convention authors must follow is to resolve the tool on the main thread. This fixture deliberately
// violates that convention so a test can pin the boundary.

module.exports = function build() {
	return {
		task: async ({workspace, options: {projectNamespace}}) => {
			log.verbose("tool-content-worker-task executed");
			const resource = await workspace.byPath(`/resources/${projectNamespace}/test.js`);
			if (!resource) {
				return;
			}
			const worker = new Worker(path.join(__dirname, "tool-content-worker.js"));
			try {
				const src = await resource.getString();
				const transformed = await new Promise((resolve, reject) => {
					worker.once("message", resolve);
					worker.once("error", reject);
					worker.postMessage(src);
				});
				resource.setString(transformed);
				await workspace.write(resource);
			} finally {
				await worker.terminate();
			}
		}
	};
};
