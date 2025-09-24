import {readdir, readFile} from "node:fs/promises";
import path from "node:path";

export async function findFiles(dirPath) {
	const files = await readdir(dirPath, {withFileTypes: true, recursive: true});
	return files.filter((file) => file.isFile()).map((file) => path.join(file.parentPath || file.path, file.name));
}

export async function readFileContent(filePath) {
	return await readFile(filePath, {encoding: "utf8"});
}

export async function directoryDeepEqual(t, destPath, expectedPath) {
	const dest = await readdir(destPath, {recursive: true});
	const expected = await readdir(expectedPath, {recursive: true});
	t.deepEqual(dest, expected);
}

export async function fileEqual(t, destPath, expectedPath) {
	const destContent = await readFileContent(destPath);
	const expectedContent = await readFileContent(expectedPath);
	t.is(destContent, expectedContent);
}

