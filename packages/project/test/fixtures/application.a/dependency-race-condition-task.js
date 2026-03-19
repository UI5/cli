const {readFile, writeFile} = require("fs/promises");
const path = require("path");

/**
 * Custom task that verifies the frozen CAS reader protects against
 * cross-project dependency source race conditions.
 *
 * Uses data.json — an untransformed source file (no placeholders, not processed by
 * minify/replaceCopyright/replaceVersion). This is critical because transformed files
 * are written to stage writers which have higher priority than both the frozen reader
 * and the filesystem reader, making disk modifications invisible regardless.
 *
 * Flow:
 * 1. Read library.d's data.json via the dependency reader (CAS-backed)
 * 2. Overwrite the file on disk with different content
 * 3. Re-read via the dependency reader
 * 4. Assert the content is still the original (CAS-served)
 * 5. Restore the original file on disk
 */
module.exports = async function ({taskUtil}) {
	const libDProject = taskUtil.getProject("library.d");
	const libDReader = libDProject.getReader();

	// Step 1: Read the original content via the dependency reader (CAS-backed)
	// data.json is untransformed (no placeholders, not a .js file subject to minification)
	// so it is only served by the frozen CAS reader or the filesystem reader
	const resourcePath = "/resources/library/d/data.json";
	const originalResource = await libDReader.byPath(resourcePath);
	if (!originalResource) {
		throw new Error(`Resource ${resourcePath} not found via dependency reader`);
	}
	const originalContent = await originalResource.getString();

	// Step 2: Overwrite the file on disk
	const sourcePath = libDProject.getSourcePath();
	const diskFilePath = path.join(sourcePath, "library", "d", "data.json");
	const diskOriginalContent = await readFile(diskFilePath, {encoding: "utf8"});
	await writeFile(diskFilePath, JSON.stringify({key: "modified-by-race-condition"}));

	try {
		// Step 3: Re-read via the dependency reader — should still return CAS-frozen content
		// Without the frozen reader, this would read the modified disk content
		const reReadResource = await libDReader.byPath(resourcePath);
		if (!reReadResource) {
			throw new Error(`Resource ${resourcePath} not found on re-read via dependency reader`);
		}
		const reReadContent = await reReadResource.getString();

		// Step 4: Assert the content is still the original (not modified disk content)
		if (reReadContent !== originalContent) {
			throw new Error(
				"Frozen source reader protection failed: dependency reader returned modified disk content " +
				"instead of the original CAS-frozen content. " +
				`Expected: ${JSON.stringify(originalContent)}, Got: ${JSON.stringify(reReadContent)}`
			);
		}
	} finally {
		// Step 5: Always restore the original file on disk
		await writeFile(diskFilePath, diskOriginalContent);
	}
};
