import test from "ava";
import fs from "node:fs/promises";
import {createFixtureTesterFactory, registerBuildHooks} from "./__helper__/ProjectBuilderFixtureTester.js";
import {configureTagIsolation, assertTagTasks} from "./__helper__/tagIsolation.js";

const FixtureTester = createFixtureTesterFactory("tags");
registerBuildHooks(test);

for (const stepBased of [false, true]) {
	test.serial(`Build tags stay local across cold, warm and changed builds (stepBased=${stepBased})`, async (t) => {
		const tester = new FixtureTester(t, "application.a");
		await tester._initialize();
		const {inputPath, triggerPath} = await configureTagIsolation(tester.fixturePath, stepBased);
		const config = {
			destPath: tester.destPath, cleanDest: true, dependencyIncludes: {includeAllDependencies: true}
		};
		const assertOutput = async (expected) => {
			t.is(await fs.readFile(`${tester.destPath}/tag-report.txt`, "utf8"), expected);
			await t.throwsAsync(fs.stat(`${tester.destPath}/tag-omitted.txt`), {code: "ENOENT"});
			await t.throwsAsync(fs.stat(`${tester.destPath}/resources/library/d/tag-input.txt`), {code: "ENOENT"});
		};

		await tester.buildProject({config});
		assertTagTasks(t, {setterSkipped: false, producerExecuted: true});
		await assertOutput("input-1:trigger-1");

		await tester.buildProject({config, assertions: {projects: {}}});
		await assertOutput("input-1:trigger-1");

		// Only the reader's input changes. The setter must restore its tags from its cached stage.
		await fs.writeFile(triggerPath, "trigger-2");
		await tester.buildProject({config});
		assertTagTasks(t, {setterSkipped: true});
		await assertOutput("input-1:trigger-2");

		await fs.writeFile(inputPath, "input-2");
		await tester.buildProject({config});
		assertTagTasks(t, {setterSkipped: false, producerExecuted: true});
		await assertOutput("input-2:trigger-2");
	});
}
