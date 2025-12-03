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

const chacheManagerInstances = new Map();

/**
 * Persistence management for the build cache. Using a file-based index and cacache
 *
 * cacheDir structure:
 * - cas/ -- cacache content addressable storage
 * - buildManifests/ -- build manifest files (acting as index, internally referencing cacache entries)
 *
 */
export class CacheManager {
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

		if (!chacheManagerInstances.has(cacheDir)) {
			chacheManagerInstances.set(cacheDir, new CacheManager(cacheDir));
		}
		return chacheManagerInstances.get(cacheDir);
	}

	#getBuildManifestPath(packageName, buildSignature) {
		const pkgDir = getPathFromPackageName(packageName);
		return path.join(this._cacheDir, pkgDir, buildSignature);
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
		await mkdir(manifestPath, {recursive: true});
		await writeFile(manifestPath, JSON.stringify(manifest), "utf8");
	}

	async getTaskEntry(cacheKey, taskName, channel) {
		try {
			const result = await cacache.get(this._cacheDir, cacheKey);
			return JSON.parse(result.data.toString("utf8"));
		} catch (err) {
			if (err.code === "ENOENT" || err.code === "EINTEGRITY") {
				// Cache miss
				return null;
			}
			throw err;
		}
	}

	async putEntry(cacheKey, data) {
		await cacache.put(this._cacheDir, cacheKey, data);
	}

	async putStream(cacheKey, stream) {
		await cacache.put.stream(this._cacheDir, cacheKey, stream);
	}
}
