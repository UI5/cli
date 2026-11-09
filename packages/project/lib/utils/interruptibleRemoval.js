import fs from "node:fs/promises";
import {renameSync} from "node:fs";
import path from "node:path";
import {getRandomValues} from "node:crypto";

/**
 * Atomically marks a directory for removal by renaming it to a temporary name.
 *
 * Uses a synchronous rename so the directory vanishes in the same execution frame
 * as the call — no event-loop yield occurs between the call and the rename
 * completing. This guarantees that no other async code can observe the directory
 * still present after this function returns.
 *
 * The caller may then call {@link removePendingDir} to finish the deletion at
 * any point — even across process restarts.
 *
 * @param {string} sourceDir Absolute path to the directory to mark for removal
 * @param {string} prefix Prefix for the temporary removal directory name
 * @returns {string|null} Absolute path of the pending removal directory,
 *   or null if sourceDir was already removed by a concurrent process (ENOENT).
 * @throws {Error} For any fs error other than ENOENT
 */
export function markForRemoval(sourceDir, prefix) {
	const pendingDir = path.join(
		path.dirname(sourceDir),
		`${prefix}${Buffer.from(getRandomValues(new Uint8Array(2))).toString("hex")}`
	);
	try {
		renameSync(sourceDir, pendingDir);
	} catch (err) {
		// Not found- good, another process already removed it
		if ((err).code === "ENOENT") {
			return null;
		}
		throw err;
	}
	return pendingDir;
}

/**
 * Removes a pending removal directory created by {@link markForRemoval}.
 *
 * @param {string} pendingDir Absolute path to the pending removal directory
 * @returns {Promise<void>}
 */
export async function removePendingDir(pendingDir) {
	await fs.rm(pendingDir, {recursive: true, force: true});
}

/**
 * Scans a directory for pending removal directories left behind by previously
 * interrupted operations (i.e. process killed after rename but before deletion).
 *
 * Returns the absolute paths of all matching subdirectories. Errors reading
 * individual entries are swallowed so one stuck directory does not block the rest.
 *
 * @param {string} scanRoot Absolute path to the directory to scan
 * @param {string} prefix Prefix that pending removal directories start with
 * @returns {Promise<string[]>} Absolute paths of pending removal directories;
 *   empty array if scanRoot is unreadable.
 */
export async function scanPendingRemovals(scanRoot, prefix) {
	let entries;
	try {
		entries = await fs.readdir(scanRoot, {withFileTypes: true});
	} catch {
		return [];
	}
	return entries
		.filter((e) => e.isDirectory() && e.name.startsWith(prefix))
		.map((e) => path.join(scanRoot, e.name));
}
