import test from "ava";
import path from "node:path";
import {stat} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {mkdirp} from "../../../lib/utils/fs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("mkdirp: Create directory hierarchy", async (t) => {
	const targetPath = path.join(__dirname, "..", "..", "tmp", "mkdir-test", "this", "is", "a", "directory");
	await mkdirp(targetPath);
	const res = await stat(targetPath);
	t.truthy(res, "Target directory has been created");
});
