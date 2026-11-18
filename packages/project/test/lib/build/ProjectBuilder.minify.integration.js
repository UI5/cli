import test from "ava";
import fs from "node:fs/promises";
import path from "node:path";
import {dump} from "js-yaml";
import * as taskRepository from "@ui5/builder/internal/taskRepository";
import {graphFromPackageDependencies} from "../../../lib/graph/graph.js";
import ProjectBuilder from "../../../lib/build/ProjectBuilder.js";

const base = "/resources/minify/test/";
const source = "function identity(value) { return value; }\n";
const debugSource = source + "// existing excluded debug variant\n";
const hasDebug = {"ui5:HasDebugVariant": true};
const isDebug = {"ui5:IsDebugVariant": true};

// Setup function for the minify integration tests with an actual project build
async function createProject(t, reuseBuilder) {
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
		builder: {minification: {excludes: ["minify/test/A*.js"]}},
	}));
	for (const [name, content] of Object.entries({"A.js": source, "A-dbg.js": debugSource, "plain.js": source})) {
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
				// Restore from SQLite next time instead of reusing this builder's in-memory cache.
				builder.closeCacheManager();
				builder = undefined;
			}
			activity.minified.sort();
			return {output, activity};
		},
	};
}

for (const reuseBuilder of [false, true]) {
	test.serial(`minify: excluded pair tags across builds (reuseBuilder=${reuseBuilder})`, async (t) => {
		const project = await createProject(t, reuseBuilder);

		// First build: the excluded pair stays unchanged and receives real resource tags.
		const cold = await project.build();
		t.deepEqual(cold.activity, {enumerations: 1, minified: ["plain.js"], pairs: 1, warnings: []});
		t.deepEqual(cold.output.get("A.js"), {content: source, tags: hasDebug});
		t.deepEqual(cold.output.get("A-dbg.js"), {content: debugSource, tags: isDebug});
		t.false(cold.output.has("A.js.map"));
		t.deepEqual(cold.output.get("plain.js").tags, hasDebug);
		t.not(cold.output.get("plain.js").content, source);
		t.deepEqual(cold.output.get("plain-dbg.js"), {content: source, tags: isDebug});
		t.true(cold.output.has("plain.js.map"));

		// Unchanged build: restore output and tags without executing keys() or each().
		const warm = await project.build();
		t.deepEqual(warm.output, cold.output);
		t.deepEqual(warm.activity, {enumerations: 0, minified: [], pairs: 0, warnings: []});

		// Editing the excluded debug member reruns only its pair's tagging invocation.
		const changedDebug = source + "// changed excluded debug variant\n";
		await project.write("A-dbg.js", changedDebug);
		const delta = await project.build(["A-dbg.js"]);
		t.deepEqual(delta.activity, {enumerations: 1, minified: [], pairs: 1, warnings: []});
		t.deepEqual(delta.output.get("A.js"), cold.output.get("A.js"));
		t.deepEqual(delta.output.get("A-dbg.js"), {content: changedDebug, tags: isDebug});
		for (const name of ["plain.js", "plain-dbg.js", "plain.js.map"]) {
			t.deepEqual(delta.output.get(name), cold.output.get(name), "Unrelated minification stays cached");
		}
	});
}
