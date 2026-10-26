import fs from "node:fs/promises";
import path from "node:path";
import {load, dump} from "js-yaml";

export async function configureTagIsolation(fixturePath, stepBased) {
	const libraryPath = path.join(fixturePath, "node_modules/library.d");
	const libraryConfigPath = path.join(libraryPath, "ui5.yaml");
	const libraryConfig = load(await fs.readFile(libraryConfigPath, "utf8"));
	libraryConfig.builder = {customTasks: [{name: "tag-producer", afterTask: "minify"}]};
	await fs.writeFile(libraryConfigPath, dump(libraryConfig));

	const definitions = [
		{
			specVersion: "5.0", type: "application", metadata: {name: "application.a"},
			builder: {customTasks: [
				{name: "tag-setter", afterTask: "minify"},
				{name: "tag-reader", afterTask: "tag-setter"}
			]}
		},
		...[
			["tag-producer", "producer.cjs"],
			["tag-setter", stepBased ? "step-setter.cjs" : "setter.cjs"],
			["tag-reader", "reader.cjs"]
		].map(([name, file]) => ({
			specVersion: "5.0", kind: "extension", type: "task", metadata: {name},
			task: {path: `tag-isolation/${file}`}
		}))
	];
	await fs.writeFile(path.join(fixturePath, "ui5.yaml"), definitions.map((doc) => dump(doc)).join("---\n"));
	const inputPath = path.join(libraryPath, "main/src/library/d/tag-input.txt");
	const triggerPath = path.join(fixturePath, "webapp/tag-trigger.txt");
	await fs.writeFile(inputPath, "input-1");
	await fs.writeFile(triggerPath, "trigger-1");
	return {inputPath, triggerPath};
}

export function assertTagTasks(t, {setterSkipped, producerExecuted = false}) {
	const events = t.context.projectBuildStatusEventStub.args.map(([event]) => event);
	t.true(events.some((event) => event.projectName === "application.a" &&
		event.taskName === "tag-reader" && event.status === "task-start"), "The tag reader executed");
	t.true(events.some((event) => event.projectName === "application.a" &&
		event.taskName === "tag-setter" && event.status === (setterSkipped ? "task-skip" : "task-start")),
	setterSkipped ? "The setter's stage was restored from cache" : "The tag setter executed");
	t.is(events.some((event) => event.projectName === "library.d" && event.status === "task-start"),
		producerExecuted, producerExecuted ? "The dependency executed tasks" : "The dependency used its cached result");
}
