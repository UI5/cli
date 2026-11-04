import test from "ava";
import fs from "node:fs/promises";
import path from "node:path";
import {dump} from "js-yaml";
import * as taskRepository from "@ui5/builder/internal/taskRepository";
import {graphFromPackageDependencies} from "../../../lib/graph/graph.js";
import ProjectBuilder from "../../../lib/build/ProjectBuilder.js";

const base = "/resources/minify/test/";
const source = "function identity(value) { return value; }\n";
const hasDebug = {"ui5:HasDebugVariant": true};
const isDebug = {"ui5:IsDebugVariant": true};

// Use the real minify descriptor, readers, StepRunner and cache. Instrument the callbacks rather than
// inferring execution from output files: a cache hit restores identical output without running each.
async function createProject(t, {reuseBuilder, excludes, files}) {
	const tmpDir = path.resolve(import.meta.dirname, "../../tmp/minify");
	await fs.mkdir(tmpDir, {recursive: true});
	const cwd = await fs.mkdtemp(path.join(tmpDir, "project-"));
	let builder;
	t.teardown(async () => {
		builder?.closeCacheManager();
		await fs.rm(cwd, {recursive: true, force: true, maxRetries: 3, retryDelay: 100});
	});
	await fs.mkdir(path.join(cwd, "webapp"));
	await fs.writeFile(path.join(cwd, "package.json"), JSON.stringify({name: "minify-test", version: "1.0.0"}));
	await fs.writeFile(path.join(cwd, "webapp/manifest.json"), JSON.stringify({
		"sap.app": {id: "minify.test", type: "application"},
	}));
	await fs.writeFile(path.join(cwd, "ui5.yaml"), dump({
		specVersion: "5.0", type: "application", metadata: {name: "minify-test"},
		builder: {minification: {excludes: excludes.map((p) => p.startsWith("!") ?
			`!minify/test/${p.slice(1)}` : `minify/test/${p}`)}},
	}));
	for (const [name, content] of Object.entries(files)) {
		await fs.writeFile(path.join(cwd, "webapp", name), content);
	}

	let activity;
	const onLog = ({level, moduleName, message}) => {
		if (level === "warn" && moduleName === "builder:tasks:minify") {
			activity.warnings.push(message);
		}
	};
	process.on("ui5.log", onLog);
	t.teardown(() => process.off("ui5.log", onLog));
	const repository = {
		...taskRepository,
		getTask: async (name) => {
			const info = await taskRepository.getTask(name);
			if (name !== "minify") {
				return info;
			}
			return {task: (options) => {
				const descriptor = info.task(options);
				return {...descriptor, steps: descriptor.steps.map((step) => ({
					...step,
					keys: async (ctx) => {
						activity.enumerations++;
						return step.keys(ctx);
					},
					each: async (key, ctx) => {
						if (typeof key === "string") {
							activity.pairs++;
						} else {
							activity.minified.push(key.getPath().slice(base.length));
						}
						return step.each(key, ctx);
					},
				}))};
			}};
		},
	};
	let graph;
	return {
		write: (name, content) => fs.writeFile(path.join(cwd, "webapp", name), content),
		remove: (name) => fs.rm(path.join(cwd, "webapp", name)),
		build: async (changed = []) => {
			activity = {enumerations: 0, minified: [], pairs: 0, warnings: []};
			if (!builder) {
				graph = await graphFromPackageDependencies({cwd});
				graph.seal();
				builder = new ProjectBuilder({
					graph, taskRepository: repository, ui5DataDir: path.join(cwd, ".ui5"),
					buildConfig: {excludedTasks: ["*"], includedTasks: ["minify"]},
				});
			} else if (changed.length) {
				builder.resourcesChanged(new Map([["minify-test", new Set(changed.map((name) => base + name))]]));
			}
			await builder.build({});
			const resources = await graph.getRoot().getReader().byGlob(`${base}**/*`);
			resources.sort((a, b) => a.getPath().localeCompare(b.getPath()));
			const output = new Map(await Promise.all(resources.map(async (res) => [
				res.getPath().slice(base.length), {content: await res.getString(), tags: res.getTags()},
			])));
			if (!reuseBuilder) {
				// The next build must restore from SQLite, not this builder's in-memory StageCache.
				builder.closeCacheManager();
				builder = undefined;
			}
			activity.minified.sort();
			return {output, activity};
		},
	};
}

for (const reuseBuilder of [false, true]) {
	test.serial(`minify: excluded pairs across warm and delta builds (reuseBuilder=${reuseBuilder})`, async (t) => {
		const project = await createProject(t, {
			reuseBuilder, excludes: ["A*.js", "orphan-dbg.js"],
			files: {
				"A.js": source,
				"A-dbg.js": source + "// existing excluded debug variant\n",
				"C.js": source,
				"C-dbg.js": source + "// existing non-excluded debug variant\n",
				"plain.js": source,
				"orphan-dbg.js": source,
			},
		});
		const cold = await project.build();
		t.deepEqual(cold.activity.minified, ["plain.js"]);
		t.is(cold.activity.pairs, 2);
		t.is(cold.activity.warnings.length, 1);
		t.true(cold.activity.warnings[0].includes(`${base}C.js`));
		t.true(cold.activity.warnings[0].includes("builder.minification.excludes"));
		for (const name of ["A", "C", "plain"]) {
			t.deepEqual(cold.output.get(`${name}.js`).tags, hasDebug);
			t.deepEqual(cold.output.get(`${name}-dbg.js`).tags, isDebug);
		}
		t.is(cold.output.get("A.js").content, source, "Excluded resource is not transformed");
		t.is(cold.output.get("orphan-dbg.js").tags, null, "An excluded orphan is not tagged by filename alone");
		t.false(cold.output.has("A.js.map"));
		t.false(cold.output.has("C.js.map"));
		t.not(cold.output.get("plain.js").content, source);
		t.is(cold.output.get("plain-dbg.js").content, source);

		const warm = await project.build();
		t.deepEqual(warm.output, cold.output, "Warm cache restores both generated and pre-existing pairs' tags");
		t.deepEqual(warm.activity, {enumerations: 0, minified: [], pairs: 0, warnings: []});

		await project.write("plain.js", source + "identity(42);\n");
		const ordinaryDelta = await project.build(["plain.js"]);
		t.deepEqual(ordinaryDelta.activity, {enumerations: 1, minified: ["plain.js"], pairs: 0, warnings: []});
		for (const name of ["A.js", "A-dbg.js", "C.js", "C-dbg.js"]) {
			t.deepEqual(ordinaryDelta.output.get(name), cold.output.get(name), "Unchanged pairs' tags are replayed");
		}

		const changedDebug = source + "// changed excluded debug variant\n";
		await project.write("A-dbg.js", changedDebug);
		const pairDelta = await project.build(["A-dbg.js"]);
		t.deepEqual(pairDelta.activity, {enumerations: 1, minified: [], pairs: 1, warnings: []});
		t.deepEqual(pairDelta.output.get("A-dbg.js"), {content: changedDebug, tags: isDebug});
		t.deepEqual(pairDelta.output.get("plain.js"), ordinaryDelta.output.get("plain.js"));
		t.deepEqual(pairDelta.output.get("C.js"), cold.output.get("C.js"));

		await project.remove("A-dbg.js");
		const removedDebug = await project.build(["A-dbg.js"]);
		t.deepEqual(removedDebug.activity, {enumerations: 1, minified: [], pairs: 0, warnings: []});
		t.deepEqual(removedDebug.output.get("A.js"), {content: source, tags: null},
			"Removing the debug member drops the excluded survivor's HasDebugVariant tag");
		t.false(removedDebug.output.has("A-dbg.js"));
		const removedWarm = await project.build();
		t.deepEqual(removedWarm.output, removedDebug.output, "No stale tag is persisted");
		t.is(removedWarm.activity.enumerations, 0);

		await project.write("A-dbg.js", source + "// newly added debug variant\n");
		const addedDebug = await project.build(["A-dbg.js"]);
		t.deepEqual(addedDebug.activity, {enumerations: 1, minified: [], pairs: 1, warnings: []});
		t.deepEqual(addedDebug.output.get("A.js").tags, hasDebug);
		t.deepEqual(addedDebug.output.get("A-dbg.js").tags, isDebug);

		await project.remove("A.js");
		const removedNormal = await project.build(["A.js"]);
		t.deepEqual(removedNormal.activity, {enumerations: 1, minified: [], pairs: 0, warnings: []});
		t.is(removedNormal.output.get("A-dbg.js").tags, null,
			"Removing the non-debug member drops the excluded survivor's IsDebugVariant tag");
		t.false(removedNormal.output.has("A-dbg-dbg.js"));

		// Switch an unexcluded pair to ordinary minification, then back to a source pair. Both transitions
		// must drop the old invocation's outputs without re-minifying the unrelated plain.js.
		await project.remove("C-dbg.js");
		const generated = await project.build(["C-dbg.js"]);
		t.deepEqual(generated.activity, {enumerations: 1, minified: ["C.js"], pairs: 0, warnings: []});
		t.deepEqual(generated.output.get("C-dbg.js"), {content: source, tags: isDebug});
		t.true(generated.output.has("C.js.map"));

		await project.write("C-dbg.js", source + "// restored source pair\n");
		const pairedAgain = await project.build(["C-dbg.js"]);
		t.deepEqual(pairedAgain.activity.minified, []);
		t.is(pairedAgain.activity.pairs, 1);
		t.is(pairedAgain.activity.warnings.length, 1);
		t.deepEqual(pairedAgain.output.get("C.js"), {content: source, tags: hasDebug});
		t.is(pairedAgain.output.get("C-dbg.js").content, source + "// restored source pair\n");
		t.false(pairedAgain.output.has("C.js.map"), "The removed minification key's source map is not resurrected");
	});
}

test.serial("minify: configuration re-inclusions only affect minification, not pair discovery", async (t) => {
	const project = await createProject(t, {
		reuseBuilder: false, excludes: ["*.js", "!plain.js"],
		files: {"A.js": source, "A-dbg.js": source, "plain.js": source, "excluded.js": source},
	});
	const {output, activity} = await project.build();
	t.deepEqual(activity, {enumerations: 1, minified: ["plain.js"], pairs: 1, warnings: []});
	t.deepEqual(output.get("A.js"), {content: source, tags: hasDebug});
	t.deepEqual(output.get("A-dbg.js"), {content: source, tags: isDebug});
	t.deepEqual(output.get("excluded.js"), {content: source, tags: null});
	t.not(output.get("plain.js").content, source);
});
