import path from "node:path";
import {mkdirp} from "../utils/fs.js";
import {promisify} from "node:util";
import {getLogger} from "@ui5/logger";
import {LOCK_STALE_MS, CLEANUP_LOCK_NAME} from "./_frameworkPaths.js";
import {getLockDir} from "../utils/dataDir.js";
const log = getLogger("ui5Framework:Installer");

// File name must not start with one or multiple dots and should not contain characters other than:
// * alphanumeric
// * Slash (typically present in package names, hence is accepted and then replaced with a dash)
// * Dot, dash, underscore, at-sign
const illegalFileNameRegExp = /[^0-9a-zA-Z\-._@/]/;

class AbstractInstaller {
	/**
	 * @param {string} ui5DataDir UI5 home directory location. This will be used to store packages,
	 * metadata and configuration used by the resolvers.
	 */
	constructor(ui5DataDir) {
		if (new.target === AbstractInstaller) {
			throw new TypeError("Class 'AbstractInstaller' is abstract");
		}
		if (!ui5DataDir) {
			throw new Error(`Installer: Missing parameter "ui5DataDir"`);
		}
		this._lockDir = getLockDir(ui5DataDir);
	}

	async _synchronize(lockName, callback) {
		const {
			default: lockfile
		} = await import("lockfile");
		const lock = promisify(lockfile.lock);
		const unlock = promisify(lockfile.unlock);
		const check = promisify(lockfile.check);
		const lockPath = this._getLockPath(lockName);
		await mkdirp(this._lockDir);

		log.verbose("Locking " + lockPath);
		await lock(lockPath, {
			wait: 10000,
			stale: LOCK_STALE_MS,
			retries: 10
		});
		try {
			// Abort if cache cleanup is in progress. Checking after acquiring our lock
			// ensures cleanCache's hasActiveLocks scan will see us if both run concurrently.
			const cleanupLockPath = path.join(this._lockDir, CLEANUP_LOCK_NAME);
			if (await check(cleanupLockPath, {stale: LOCK_STALE_MS})) {
				throw new Error(
					"Framework cache is currently being cleaned. " +
					"Please wait for the cache clean operation to finish and try again."
				);
			}
			const res = await callback();
			return res;
		} finally {
			log.verbose("Unlocking " + lockPath);
			await unlock(lockPath);
		}
	}

	_sanitizeFileName(fileName) {
		if (fileName.startsWith(".") || illegalFileNameRegExp.test(fileName)) {
			throw new Error(`Illegal file name: ${fileName}`);
		}
		return fileName.replace(/\//g, "-");
	}

	_getLockPath(lockName) {
		return path.join(this._lockDir, `${this._sanitizeFileName(lockName)}.lock`);
	}
}

export default AbstractInstaller;
