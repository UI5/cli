import path from "node:path";

const forbiddenCharsRegex = /[^0-9a-zA-Z\-._]/g;
const windowsReservedNames = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/**
 * Sanitize a file name by replacing any characters not matching the allowed set with a dash.
 * Additionally validate that the file name to make sure it is safe to use on various file systems.
 *
 * @param {string} fileName The file name to validate
 * @returns {string} The sanitized file name
 * @throws {Error} If the file name is empty, starts with a dot, contains a reserved value, or is too long
 */
export default function sanitizeFileName(fileName) {
	if (!fileName) {
		throw new Error("Illegal empty file name");
	}
	if (fileName.startsWith(".")) {
		throw new Error(`Illegal file name starting with a dot: ${fileName}`);
	}
	fileName = fileName.replaceAll(forbiddenCharsRegex, "-");

	if (fileName.length > 255) {
		throw new Error(`Illegal file name exceeding maximum length of 255 characters: ${fileName}`);
	}

	if (windowsReservedNames.test(fileName)) {
		throw new Error(`Illegal file name reserved on Windows systems: ${fileName}`);
	}

	return fileName;
}

export function getPathFromPackageName(pkgName) {
	// If pkgName starts with a scope, that becomes a folder
	if (pkgName.startsWith("@") && pkgName.includes("/")) {
		// Split at first slash to get the scope and sanitize it without the "@"
		const scope = sanitizeFileName(pkgName.substring(1, pkgName.indexOf("/")));
		// Get the rest of the package name
		const pkg = pkgName.substring(pkgName.indexOf("/") + 1);
		return path.join(`@${sanitizeFileName(scope)}`, sanitizeFileName(pkg));
	}
	return sanitizeFileName(pkgName);
}
