// Route @ui5/logger's stderr fallback output into ignored no-op listeners so that
// intentional error/build log lines don't clutter the test output (see suppressLog.js).
// Pass a file:// URL (not a filesystem path) to --import: Node's ESM loader treats the
// argument as a module specifier, and on Windows an absolute path like "d:\..." is
// misread as protocol "d:" (ERR_UNSUPPORTED_ESM_URL_SCHEME).
const suppressLog = new URL("./test/suppressLog.js", import.meta.url).href;

export default {
	files: [
		"test/lib/**/*.js",
		"!test/**/__helper__/**"
	],
	watchMode: {
		ignoreChanges: [
			"test/tmp/**"
		],
	},
	nodeArguments: [
		"--loader=esmock",
		"--no-warnings",
		"--import",
		suppressLog
	],
	workerThreads: false,
};
