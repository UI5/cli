import cacache from "cacache";
import path from "node:path";
import fs from "graceful-fs";
import {promisify} from "node:util";
const mkdir = promisify(fs.mkdir);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
import os from "node:os";
import Configuration from "../../config/Configuration.js";
import {getPathFromPackageName} from "../../utils/sanitizeFileName.js";
import {getLogger} from "@ui5/logger";

const log = getLogger("project:build:cache:CacheManager");

const chacheManagerInstances = new Map();
const CACACHE_OPTIONS = {algorithms: ["sha256"]};

/**
 * Persistence management for the build cache. Using a file-based index and cacache
 *
 * cacheDir structure:
 * - cas/ -- cacache content addressable storage
 * - buildManifests/ -- build manifest files (acting as index, internally referencing cacache entries)
 *
 */
export default class CacheManager {
	constructor(cacheDir) {
		this._cacheDir = cacheDir;
	}

	static async create(cwd) {
		// ENV var should take precedence over the dataDir from the configuration.
		let ui5DataDir = process.env.UI5_DATA_DIR;
		if (!ui5DataDir) {
			const config = await Configuration.fromFile();
			ui5DataDir = config.getUi5DataDir();
		}
		if (ui5DataDir) {
			ui5DataDir = path.resolve(cwd, ui5DataDir);
		} else {
			ui5DataDir = path.join(os.homedir(), ".ui5");
		}
		const cacheDir = path.join(ui5DataDir, "buildCache");
		log.verbose(`Using build cache directory: ${cacheDir}`);

		if (!chacheManagerInstances.has(cacheDir)) {
			chacheManagerInstances.set(cacheDir, new CacheManager(cacheDir));
		}
		return chacheManagerInstances.get(cacheDir);
	}

	#getBuildManifestPath(packageName, buildSignature) {
		const pkgDir = getPathFromPackageName(packageName);
		return path.join(this._cacheDir, pkgDir, `${buildSignature}.json`);
	}

	async readBuildManifest(project, buildSignature) {
		try {
			const manifest = await readFile(this.#getBuildManifestPath(project.getId(), buildSignature), "utf8");
			return JSON.parse(manifest);
		} catch (err) {
			if (err.code === "ENOENT") {
				// Cache miss
				return null;
			}
			throw err;
		}
	}

	async writeBuildManifest(project, buildSignature, manifest) {
		const manifestPath = this.#getBuildManifestPath(project.getId(), buildSignature);
		await mkdir(path.dirname(manifestPath), {recursive: true});
		await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
	}

	async getResourcePathForStage(buildSignature, stageName, resourcePath, integrity) {
		// try {
		if (!integrity) {
			throw new Error("Integrity hash must be provided to read from cache");
		}
		const cacheKey = this.#createKeyForStage(buildSignature, stageName, resourcePath);
		const result = await cacache.get.info(this._cacheDir, cacheKey);
		if (result.integrity !== integrity) {
			log.info(`Integrity mismatch for cache entry ` +
				`${cacheKey}: expected ${integrity}, got ${result.integrity}`);

			const res = await cacache.get.byDigest(this._cacheDir, result.integrity);
			if (res) {
				log.info(`Updating cache entry with expectation...`);
				await this.writeStage(buildSignature, stageName, resourcePath, res.data);
				return await this.getResourcePathForStage(buildSignature, stageName, resourcePath, integrity);
			}
		}
		if (!result) {
			return null;
		}
		return result.path;
		// } catch (err) {
		// 	if (err.code === "ENOENT") {
		// 		// Cache miss
		// 		return null;
		// 	}
		// 	throw err;
		// }
	}

	async writeStage(buildSignature, stageName, resourcePath, buffer) {
		return await cacache.put(
			this._cacheDir,
			this.#createKeyForStage(buildSignature, stageName, resourcePath),
			buffer,
			CACACHE_OPTIONS
		);
	}

	async writeStageStream(buildSignature, stageName, resourcePath, stream) {
		const writable = cacache.put.stream(
			this._cacheDir,
			this.#createKeyForStage(buildSignature, stageName, resourcePath),
			stream,
			CACACHE_OPTIONS,
		);
		return new Promise((resolve, reject) => {
			writable.on("integrity", (digest) => {
				resolve(digest);
			});
			writable.on("error", (err) => {
				reject(err);
			});
			stream.pipe(writable);
		});
	}

	#createKeyForStage(buildSignature, stageName, resourcePath) {
		return `${buildSignature}|${stageName}|${resourcePath}`;
	}
}
