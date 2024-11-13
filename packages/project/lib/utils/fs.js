import fs from "graceful-fs";
import {promisify} from "node:util";
const mkdir = promisify(fs.mkdir);
const rm = promisify(fs.rm);

export async function mkdirp(dirPath) {
	return mkdir(dirPath, {recursive: true});
}

export async function rmrf(dirPath) {
	return rm(dirPath, {recursive: true, force: true});
}
