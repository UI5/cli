import test from "ava";
import fs from "node:fs/promises";
import path from "node:path";
import {createAdapter, createResource} from "@ui5/fs/resourceFactory";
import minify from "../../../lib/tasks/minify.js";

// Compare the in-memory eligibility matcher with the old ordered glob query, including adapter
// prefix normalization. No pairs are needed here: each returned key is an eligible input resource.
for (const fileSystem of [false, true]) {
	test(`minify: exclusion matching agrees with the reader (fileSystem=${fileSystem})`, async (t) => {
		let fsBasePath;
		if (fileSystem) {
			const tmp = path.resolve(import.meta.dirname, "../../tmp/minify-excludes");
			await fs.mkdir(tmp, {recursive: true});
			fsBasePath = await fs.mkdtemp(path.join(tmp, "sources-"));
			t.teardown(() => fs.rm(fsBasePath, {recursive: true, force: true}));
		}
		for (const virBasePath of ["/resources/", "/resources/ns/", "/test-resources/"]) {
			const workspace = createAdapter({virBasePath, fsBasePath});
			for (const name of [
				"a.js", "b.js", "sub/a.js", ".hidden.js", "sub/.hidden.js",
				"Rules.support.js", "sub/Rules.support.js", "name[1].js",
			]) {
				await workspace.write(createResource({path: virBasePath + name, string: "source"}));
			}
			for (const excludes of [
				[], ["*.js"], ["**/*.js"], ["**/.*.js"],
				["**/{a,b}.js", "!**/a.js"], ["**/+(a|b).js"], ["**/!(b).js"],
				["**/*.js", "!**/a.js", "**/a.js"], ["!**/*.support.js"],
				["ns/**/*.js", "!ns/a.js"], ["**/name\\[1\\].js"],
			]) {
				const previousPattern = ["/**/*.js", "!**/*.support.js", ...excludes.map((exclude) =>
					exclude.startsWith("!") ? `/resources/${exclude.slice(1)}` : `!/resources/${exclude}`)];
				const expected = await workspace.byGlob(previousPattern);
				const [step] = minify({pattern: "/**/*.js", excludes}).steps;
				const keys = await step.keys({workspace});
				t.deepEqual(keys.map((res) => res.getPath()).sort(), expected.map((res) => res.getPath()).sort(),
					`Same eligibility for ${virBasePath} and ${JSON.stringify(excludes)}`);
			}
		}
	});
}
