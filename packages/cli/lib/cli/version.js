let version;

// This module holds the CLI's version information (set via cli.js) for later retrieval (e.g. from middlewares/logger)
export function setVersion(v) {
	version = v;
}
export function getVersion() {
	return version;
}
