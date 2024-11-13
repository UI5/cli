import {getLogger} from "@ui5/logger";
const log = getLogger("builder:tasks:jsdoc:generateJsdoc");
import path from "node:path";
import os from "node:os";
import fs from "graceful-fs";
import {mkdirp, rmrf} from "../../utils/fs.js";
import {promisify} from "node:util";
const mkdtemp = promisify(fs.mkdtemp);
import jsdocGenerator from "../../processors/jsdoc/jsdocGenerator.js";
import {createAdapter} from "@ui5/fs/resourceFactory";

/**
 * @public
 * @module @ui5/builder/tasks/jsdoc/generateJsdoc
 */

/**
 *
 * @public
 * @typedef {object} GenerateJsdocOptions
 * @property {string|string[]} pattern Pattern to locate the files to be processed
 * @property {string} projectName Project name
 * @property {string} namespace Namespace to build (e.g. <code>some/project/name</code>)
 * @property {string} version Project version
 */

/**
 * Task to execute a JSDoc build for UI5 projects
 *
 * @public
 * @function default
 * @static
 *
 * @param {object} parameters Parameters
 * @param {@ui5/fs/DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {@ui5/fs/AbstractReader} parameters.dependencies Reader or Collection to read dependency files
 * @param {module:@ui5/builder/tasks/jsdoc/generateJsdoc~GenerateJsdocOptions} parameters.options Options
 * @param {@ui5/project/build/helpers/TaskUtil|object} [parameters.taskUtil] TaskUtil
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
export default async function generateJsdoc({
	taskUtil,
	workspace,
	dependencies,
	options = {}
}) {
	const {projectName, namespace, version, pattern} =
	/** @type {module:@ui5/builder/tasks/jsdoc/generateJsdoc~GenerateJsdocOptions} */ (options);

	if (!projectName || !namespace || !version || !pattern) {
		throw new Error("[generateJsdoc]: One or more mandatory options not provided");
	}

	const {sourcePath: resourcePath, targetPath, tmpPath, cleanup} =
		await utils.createTmpDirs(projectName);

	taskUtil?.registerCleanupTask(cleanup);

	const [writtenResourcesCount] = await Promise.all([
		utils.writeResourcesToDir({
			workspace,
			pattern,
			targetPath: resourcePath
		}),
		utils.writeDependencyApisToDir({
			dependencies,
			targetPath: path.join(tmpPath, "dependency-apis")
		})
	]);

	if (writtenResourcesCount === 0) {
		log.info(`Failed to find any input resources for project ${projectName} using pattern ` +
			`${pattern}. Skipping JSDoc generation...`);
		return;
	}

	const createdResources = await jsdocGenerator({
		sourcePath: resourcePath,
		targetPath,
		tmpPath,
		options: {
			projectName,
			namespace,
			version,
			variants: ["apijson"]
		}
	});

	await Promise.all(createdResources.map((resource) => {
		return workspace.write(resource);
	}));
}

const utils = {
	/**
	 * Create temporary directories for JSDoc generation processor
	 *
	 * @private
	 * @param {string} projectName Project name used for naming the temporary working directory
	 * @returns {Promise<object>} Promise resolving with sourcePath, targetPath and tmpPath strings
	 */
	createTmpDirs: async function(projectName) {
		const tmpDirPath = await utils.createTmpDir(projectName);

		const sourcePath = path.join(tmpDirPath, "src"); // dir will be created by writing project resources below
		await mkdirp(sourcePath);
		const targetPath = path.join(tmpDirPath, "target"); // dir will be created by jsdoc itself
		await mkdirp(targetPath);

		const tmpPath = path.join(tmpDirPath, "tmp"); // dir needs to be created by us
		await mkdirp(tmpPath);

		return {
			sourcePath,
			targetPath,
			tmpPath,
			cleanup: async () => {
				return rmrf(tmpDirPath);
			}
		};
	},

	/**
	 * Create a temporary directory on the host system
	 *
	 * @private
	 * @param {string} projectName Project name used for naming the temporary directory
	 * @returns {Promise<string>} Promise resolving with path of the temporary directory
	 */
	createTmpDir: async function(projectName) {
		const sanitizedProjectName = projectName.replace(/[^A-Za-z0-9]/g, "");

		const tmpRootPath = path.join(os.tmpdir(), "ui5-tooling");
		await mkdirp(tmpRootPath);

		// Appending minus sign also because node docs advise to "avoid trailing X characters in prefix"
		return mkdtemp(path.join(tmpRootPath, `jsdoc-${sanitizedProjectName}-`));
	},

	/**
	 * Write resources from workspace matching the given pattern to the given fs destination
	 *
	 * @private
	 * @param {object} parameters Parameters
	 * @param {@ui5/fs/DuplexCollection} parameters.workspace DuplexCollection to read and write files
	 * @param {string} parameters.pattern Pattern to match resources in workspace against
	 * @param {string} parameters.targetPath Path to write the resources to
	 * @returns {Promise<number>} Promise resolving with number of resources written to given directory
	 */
	writeResourcesToDir: async function({workspace, pattern, targetPath}) {
		const fsTarget = createAdapter({
			fsBasePath: targetPath,
			virBasePath: "/resources/"
		});

		const allResources = await workspace.byGlob(pattern);

		// write all resources to the tmp folder
		await Promise.all(allResources.map((resource) => fsTarget.write(resource)));
		return allResources.length;
	},

	/**
	 * Write api.json files of dependencies to given target path in a flat structure
	 *
	 * @private
	 * @param {object} parameters Parameters
	 * @param {@ui5/fs/AbstractReader} parameters.dependencies Reader or Collection to read dependency files
	 * @param {string} parameters.targetPath Path to write the resources to
	 * @returns {Promise<number>} Promise resolving with number of resources written to given directory
	 */
	writeDependencyApisToDir: async function({dependencies, targetPath}) {
		const depApis = await dependencies.byGlob("/test-resources/**/designtime/api.json");

		// Clone resources before changing their path
		const apis = await Promise.all(depApis.map((resource) => resource.clone()));

		for (let i = 0; i < apis.length; i++) {
			apis[i].setPath(`/api-${i}.json`);
		}

		const fsTarget = createAdapter({
			fsBasePath: targetPath,
			virBasePath: "/"
		});
		await Promise.all(apis.map((resource) => fsTarget.write(resource)));
		return apis.length;
	}
};

// Export utils for testing only
/* istanbul ignore else */
if (process.env.NODE_ENV === "test") {
	generateJsdoc._utils = utils;
}
