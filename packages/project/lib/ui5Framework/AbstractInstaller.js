import path from "node:path";
import {mkdirp} from "../utils/fs.js";
import {promisify} from "node:util";
import {getLogger} from "@ui5/logger";
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
		this._lockDir = path.join(ui5DataDir, "framework", "locks");
	}

	async _synchronize(lockName, callback) {
		const {
			default: lockfile
		} = await import("lockfile");
		const lock = promisify(lockfile.lock);
		const unlock = promisify(lockfile.unlock);
		const lockPath = this._getLockPath(lockName);
		await mkdirp(this._lockDir);
		log.verbose("Locking " + lockPath);
		await lock(lockPath, {
			wait: 10000,
			stale: 60000,
			retries: 10
		});
		try {
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
