import fs from "graceful-fs";
import {promisify} from "node:util";
const mkdir = promisify(fs.mkdir);

export async function mkdirp(dirPath) {
	return mkdir(dirPath, {recursive: true});
}
