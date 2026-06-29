let version;
let location;

// This module holds the CLI's version information (set via cli.js) for later retrieval (e.g. from middlewares/logger)
export function setVersion(v, l) {
	version = v;
	location = l;
}
export function getVersion() {
	return version;
}
export function getVersionWithLocation() {
	if (!version) {
		return undefined;
	}
	return location ? `${version} (from ${location})` : version;
}
