import ssri from "ssri";
import path from "node:path";
import fs from "graceful-fs";
import {promisify} from "node:util";
import {gzip, gunzip, createGunzip} from "node:zlib";
const mkdir = promisify(fs.mkdir);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const rename = promisify(fs.rename);
const access = promisify(fs.access);
const unlink = promisify(fs.unlink);

let tmpCounter = 0;

/**
 * Content-addressable storage for build cache resources
 *
 * Stores gzip-compressed content keyed by the original resource integrity hash.
 * The filesystem path is a pure function of the integrity hash, enabling
 * synchronous path resolution without index lookups.
 *
 * Directory structure:
 *   {basePath}/{algorithm}/{xx}/{yy}/{rest}
 *
 * For example, integrity "sha256-abc123..." with hex digest "abcdef0123456789..." becomes:
 *   {basePath}/sha256/ab/cd/ef0123456789...
 *
 * @class
 */
export default class ContentAddressableStorage {
	#basePath;

	/**
	 * @param {string} basePath Base directory for content storage
	 */
	constructor(basePath) {
		this.#basePath = basePath;
	}

	/**
	 * Computes the filesystem path for a given integrity hash
	 *
	 * This is a synchronous, pure function with no I/O.
	 *
	 * @param {string} integrity SRI integrity string (e.g., "sha256-base64encoded=")
	 * @returns {string} Absolute filesystem path to the content file
	 */
	contentPath(integrity) {
		const sri = ssri.parse(integrity, {single: true});
		const hex = sri.hexDigest();
		return path.join(
			this.#basePath,
			sri.algorithm,
			hex.slice(0, 2),
			hex.slice(2, 4),
			hex.slice(4)
		);
	}

	/**
	 * Checks whether content with the given integrity exists in storage
	 *
	 * @param {string} integrity SRI integrity string
	 * @returns {Promise<boolean>} True if content exists
	 */
	async has(integrity) {
		try {
			await access(this.contentPath(integrity));
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Stores resource content in the CAS
	 *
	 * Compresses the buffer with gzip and writes it atomically (tmp + rename).
	 * Deduplicates: skips write if content with the same integrity already exists.
	 *
	 * @param {string} integrity SRI integrity string of the uncompressed content
	 * @param {Buffer} buffer Uncompressed resource content
	 * @returns {Promise<void>}
	 */
	async put(integrity, buffer) {
		const contentPath = this.contentPath(integrity);

		// Dedup: skip if content already exists
		if (await this.has(integrity)) {
			return;
		}

		const compressedBuffer = await promisify(gzip)(buffer);
		const dirPath = path.dirname(contentPath);
		await mkdir(dirPath, {recursive: true});

		// Atomic write: write to temp file then rename.
		// Use a unique counter to avoid collisions between concurrent puts.
		const tmpPath = contentPath + `.tmp.${process.pid}.${tmpCounter++}`;
		try {
			await writeFile(tmpPath, compressedBuffer);
			await rename(tmpPath, contentPath);
		} catch (err) {
			// Clean up tmp file on failure (best effort)
			try {
				await unlink(tmpPath);
			} catch {
				// tmp file already gone (e.g., concurrent rename succeeded first)
			}
			// If the content now exists (written by a concurrent put), that's fine
			if (await this.has(integrity)) {
				return;
			}
			throw err;
		}
	}

	/**
	 * Creates a readable stream that decompresses content from the CAS
	 *
	 * This is synchronous — the stream is returned immediately.
	 *
	 * @param {string} integrity SRI integrity string
	 * @returns {import("node:stream").Readable} Decompressed content stream
	 */
	createReadStream(integrity) {
		const contentPath = this.contentPath(integrity);
		return fs.createReadStream(contentPath).pipe(createGunzip());
	}

	/**
	 * Reads and decompresses content from the CAS
	 *
	 * @param {string} integrity SRI integrity string
	 * @returns {Promise<Buffer>} Decompressed content buffer
	 */
	async readContent(integrity) {
		const contentPath = this.contentPath(integrity);
		const compressedBuffer = await readFile(contentPath);
		return await promisify(gunzip)(compressedBuffer);
	}
}
