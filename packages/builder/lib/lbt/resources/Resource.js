"use strict";

const {promisify} = require("util");
const fs = require("graceful-fs");
const readFile = promisify(fs.readFile);

class Resource {
	constructor(pool, name, file, stat) {
		this.pool = pool;
		this.name = name;
		this.file = file;
		this.fileSize = stat ? stat.size : -1;
	}

	/**
	 * @returns {Promise<Buffer>} Buffer of file
	 */
	async buffer() {
		return readFile(this.file);
	}

	/**
	 * @returns {Promise<string>} String of the file content
	 */
	async string() {
		return (await this.buffer()).toString();
	}
}

module.exports = Resource;
