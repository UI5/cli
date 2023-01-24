import {getLogger} from "@ui5/logger";
const log = getLogger("builder:processors:libraryLessGenerator");

import {promisify} from "node:util";
import posixPath from "node:path/posix";
import Resource from "@ui5/fs/Resource";

const IMPORT_PATTERN = /@import .*"(.*)";/g;
const BASE_LESS_PATTERN = /^\/resources\/sap\/ui\/core\/themes\/([^/]+)\/base\.less$/;
const GLOBAL_LESS_PATTERN = /^\/resources\/sap\/ui\/core\/themes\/([^/]+)\/global\.less$/;

class LibraryLessGenerator {
	constructor({fs}) {
		const readFile = promisify(fs.readFile);
		this.readFile = async (filePath) => readFile(filePath, {encoding: "utf8"});
	}
	async generate({filePath, fileContent}) {
		return `/* NOTE: This file was generated as an optimized version of ` +
			`"library.source.less" for the Theme Designer. */\n\n` +
			(await this.resolveLessImports({
				filePath,
				fileContent
			}));
	}
	static getPathToRoot(baseDir) {
		return posixPath.relative(baseDir, "/") + "/";
	}
	async resolveLessImports({filePath, fileContent}) {
		const imports = this.findLessImports(fileContent);
		if (!imports.length) {
			// Skip processing when no imports are found
			return fileContent;
		}
		const replacements = await Promise.all(imports.map(async (importMatch) => {
			const baseDir = posixPath.dirname(filePath);
			const resolvedFilePath = posixPath.resolve(baseDir, importMatch.path);
			importMatch.content = await this.resolveLessImport(importMatch.path, resolvedFilePath, baseDir);
			return importMatch;
		}));

		// Apply replacements in reverse order to not modify the relevant indices
		const array = Array.from(fileContent);
		for (let i = replacements.length - 1; i >= 0; i--) {
			const replacement = replacements[i];
			if (!replacement.content) {
				continue;
			}
			array.splice(
				/* index   */ replacement.matchStart,
				/* count   */ replacement.matchLength,
				/* insert  */ replacement.content
			);
		}
		return array.join("");
	}
	async resolveLessImport(originalFilePath, resolvedFilePath, baseDir) {
		// Rewrite base.less imports
		const baseLessMatch = BASE_LESS_PATTERN.exec(resolvedFilePath);
		if (baseLessMatch) {
			let baseLessThemeName = baseLessMatch[1];
			if (baseLessThemeName === "base") {
				baseLessThemeName = "baseTheme";
			}

			const baseLessPath = LibraryLessGenerator.getPathToRoot(baseDir) +
				"Base/baseLib/" + baseLessThemeName + "/base.less";
			return "@import \"" + baseLessPath + "\"; /* ORIGINAL IMPORT PATH: \"" + originalFilePath + "\" */\n";
		}

		// Rewrite library imports to correct file name
		if (posixPath.basename(resolvedFilePath) === "library.source.less") {
			return `@import "${originalFilePath.replace(/library\.source\.less$/, "library.less")}";`;
		}

		// Excluding global.less within sap.ui.core
		// It must be imported by the Theme Designer (also see declaration in sap/ui/core/.theming)
		if (GLOBAL_LESS_PATTERN.test(resolvedFilePath)) {
			return null;
		}

		/*
		 * Throw error in case of files which are not in the same directory as the current file because
		 * inlining them would break relative URLs.
		 * A possible solution would be to rewrite relative URLs when inlining the content.
		 *
		 * Keeping the import will cause errors since only "library.less" and "global.less" are
		 * configured to be available to the Theme Designer (.theming generated in generateThemeDesignerResources).
		 */
		const relativeFilePath = posixPath.relative(baseDir, resolvedFilePath);
		if (relativeFilePath.includes(posixPath.sep)) {
			throw new Error(
				`Could not inline import '${resolvedFilePath}' outside of theme directory '${baseDir}'. ` +
				`Stylesheets must be located in the theme directory (no sub-directories).`
			);
		}

		let importedFileContent;
		try {
			importedFileContent = await this.readFile(resolvedFilePath);
		} catch (err) {
			if (err.code === "ENOENT") {
				throw new Error(
					`libraryLessGenerator: Unable to resolve import '${originalFilePath}' from '${baseDir}'\n` +
					err.message
				);
			} else {
				throw err;
			}
		}
		return `/* START "${originalFilePath}" */\n` +
			(await this.resolveLessImports({
				filePath: resolvedFilePath,
				fileContent: importedFileContent
			})) +
			`\n/* END "${originalFilePath}" */\n`;
	}
	findLessImports(fileContent) {
		const imports = [];
		let match;
		while ((match = IMPORT_PATTERN.exec(fileContent)) !== null) {
			imports.push({
				path: match[1],
				matchStart: match.index,
				matchLength: match[0].length
			});
		}
		return imports;
	}
}

/**
 * @public
 * @module @ui5/builder/processors/libraryLessGenerator
 */

/**
 * Creates a "library.less" file for the SAP Theme Designer based on a "library.source.less" file.
 *
 * <ul>
 * <li>Bundles all *.less file of the theme by replacing the import with the corresponding file content</li>
 * <li>Imports to "base.less" are adopted so that they point to the "BaseLib" that is available within
 * the Theme Designer infrastructure</li>
 * <li>Imports to "global.less" are kept as they should not be bundled</li>
 * <li>Imports to "library.source.less" are adopted to "library.less"</li>
 * </ul>
 *
 * @public
 * @function default
 * @static
 *
 * @param {object} parameters Parameters
 * @param {@ui5/fs/Resource[]} parameters.resources List of <code>library.source.less</code>
 * resources
 * @param {fs|module:@ui5/fs/fsInterface} parameters.fs Node fs or custom
 * [fs interface]{@link module:@ui5/fs/fsInterface}
 * @returns {Promise<@ui5/fs/Resource[]>} Promise resolving with library.less resources
 */
async function createLibraryLess({resources, fs}) {
	const generator = new LibraryLessGenerator({fs});
	return Promise.all(resources.map(async (librarySourceLessResource) => {
		const filePath = librarySourceLessResource.getPath();
		const fileContent = await librarySourceLessResource.getString();

		log.verbose(`Generating library.less file based on ${filePath}`);

		const libraryLessFileContent = await generator.generate({filePath, fileContent});
		const libraryLessFilePath = posixPath.join(posixPath.dirname(filePath), "library.less");

		return new Resource({
			path: libraryLessFilePath,
			string: libraryLessFileContent
		});
	}));
}

export default createLibraryLess;

let myLibraryLessGenerator;
// Export class for testing only
/* istanbul ignore else */
if (process.env.NODE_ENV === "test") {
	myLibraryLessGenerator = LibraryLessGenerator;
}
export const _LibraryLessGenerator = myLibraryLessGenerator;
