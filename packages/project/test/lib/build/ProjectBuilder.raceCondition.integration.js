import test from "ava";
import fs from "node:fs/promises";
import {createFixtureTesterFactory, registerBuildHooks} from "./__helper__/ProjectBuilderFixtureTester.js";

const FixtureTester = createFixtureTesterFactory("race");
registerBuildHooks(test);

test.serial("Build race condition: file modified during active build", async (t) => {
	const fixtureTester = new FixtureTester(t, "application.a");
	const destPath = fixtureTester.destPath;
	await fixtureTester._initialize();
	const testFilePath = `${fixtureTester.fixturePath}/webapp/test.js`;
	const originalContent = await fs.readFile(testFilePath, {encoding: "utf8"});
	const addedFileName = "added-during-build.js";
	const addedFilePath = `${fixtureTester.fixturePath}/webapp/${addedFileName}`;

	// #1 Build with race condition triggered by custom task that modifies test.js during the build.
	// The build should detect the source change and throw.
	const error1 = await t.throwsAsync(fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-race-condition.yaml"},
		config: {destPath, cleanDest: true},
	}));
	t.true(error1.message.includes("Detected changes to source files of project application.a during the build"),
		"Error message indicates source change detected");

	// #2 Revert the source file to original content
	await fs.writeFile(testFilePath, originalContent);

	// #3 Build again with normal config after reverting the source.
	// Since the race condition build threw, no corrupted cache was written.
	// This build should succeed and produce clean output.
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {
				"application.a": {}
			}
		}
	});

	// Verify the output does NOT contain the race condition modification
	const finalBuiltContent = await fs.readFile(`${destPath}/test.js`, {encoding: "utf8"});
	t.false(
		finalBuiltContent.includes(`RACE CONDITION MODIFICATION`),
		"Build output does not contain race condition modification after clean rebuild"
	);

	// #4 Build with race condition triggered by add-file custom task
	await fs.rm(addedFilePath, {force: true});
	const error2 = await t.throwsAsync(fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-race-condition-add-file.yaml"},
		config: {destPath, cleanDest: true},
	}));
	t.true(error2.message.includes("Detected changes to source files of project application.a during the build"),
		"Error message indicates source change detected (add file)");

	// #5 Revert source state by removing the file that was added during build
	await fs.rm(addedFilePath, {force: true});

	// #6 Build again with normal config after reverting.
	// Cache from build #3 is still valid (same source state), so everything should be skipped.
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {}
		}
	});

	// #7 Build with race condition triggered by delete-file custom task
	const error3 = await t.throwsAsync(fixtureTester.buildProject({
		graphConfig: {rootConfigPath: "ui5-race-condition-delete-file.yaml"},
		config: {destPath, cleanDest: true},
	}));
	t.true(error3.message.includes("Detected changes to source files of project application.a during the build"),
		"Error message indicates source change detected (delete file)");

	// #8 Revert source state by restoring the deleted file
	await fs.writeFile(testFilePath, originalContent);

	// #9 Build again with normal config after restoring.
	// Cache from build #3 is still valid (same source state), so everything should be skipped.
	await fixtureTester.buildProject({
		config: {destPath, cleanDest: true},
		assertions: {
			projects: {}
		}
	});

	// Verify test.js is present in output
	const restoredBuiltFileContent = await fs.readFile(`${destPath}/test.js`, {encoding: "utf8"});
	t.true(
		restoredBuiltFileContent.includes(`console.log`),
		"Build output contains restored file after source recovery"
	);
});

test.serial("Build dependency race condition: frozen source reader protects against filesystem changes",
	async (t) => {
		const fixtureTester = new FixtureTester(t, "application.a");
		const destPath = fixtureTester.destPath;

		// Build with dependency-race-condition custom task and all dependencies included.
		// library.d is built first → its sources are frozen in CAS.
		// Then application.a builds, running the custom task that:
		//   1. Reads library.d's some.js via the dependency reader (CAS-backed)
		//   2. Modifies some.js on disk
		//   3. Re-reads via the dependency reader
		//   4. Asserts the content is still the original CAS-frozen content (not modified disk)
		//   5. Restores the file on disk
		// If the frozen reader is not working, the custom task throws and the build fails.
		await fixtureTester.buildProject({
			graphConfig: {rootConfigPath: "ui5-dependency-race-condition.yaml"},
			config: {destPath, cleanDest: true, dependencyIncludes: {includeAllDependencies: true}},
			assertions: {
				projects: {
					"library.d": {},
					"library.a": {},
					"library.b": {},
					"library.c": {},
					"application.a": {}
				}
			}
		});

		// Sanity check: verify library.d's some.js exists in build output
		const builtContent = await fs.readFile(`${destPath}/resources/library/d/some.js`, {encoding: "utf8"});
		t.truthy(builtContent, "library.d some.js exists in build output");
	});
