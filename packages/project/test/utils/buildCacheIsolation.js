import path from "node:path";

/**
 * Returns a per-test UI5 data directory under <code>test/tmp/buildcache/</code>.
 *
 * Each test gets a unique path derived from its title and the worker's PID, so
 * concurrent tests within and across AVA workers never share a build cache
 * database. Pass the returned value as <code>ui5DataDir</code> to
 * <code>graph.build()</code> or <code>graph.serve()</code> to keep the cache
 * isolated from <code>~/.ui5</code> and from other tests.
 *
 * @param {object} t AVA test context
 * @returns {string} Absolute path to a unique UI5 data dir for this test
 */
export function isolatedUi5DataDir(t) {
	const safeTitle = t.title.replace(/[^a-zA-Z0-9._-]+/g, "_");
	return path.resolve("test", "tmp", "buildcache", `${safeTitle}-${process.pid}`);
}
