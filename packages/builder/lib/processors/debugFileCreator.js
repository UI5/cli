const copier = require("./resourceCopier");
const util = require("util");

/**
 * Creates *-dbg.js files for all supplied resources.
 *
 * @public
 * @alias module:@ui5/builder.processors.debugFileCreator
 * @param {object} parameters Parameters
 * @param {module:@ui5/fs.Resource[]} parameters.resources List of resources to be processed
 * @param {fs|module:@ui5/fs.fsInterface} parameters.fs Node fs or
 *   custom [fs interface]{@link module:resources/module:@ui5/fs.fsInterface}
 * @returns {Promise<module:@ui5/fs.Resource[]>} Promise resolving with debug resources
 */
module.exports = function({resources, fs}) {
	const options = {
		pattern: /((?:\.view|\.fragment|\.controller|\.designtime|\.support)?\.js)$/,
		replacement: "-dbg$1"
	};

	const stat = util.promisify(fs.stat);

	return Promise.all(
		resources.map((resource) => {
			// check whether the debug resource path is already used in the
			// previous tasks
			return stat(resource.getPath().replace(options.pattern, options.replacement))
				.then(
					// if the file can be found, it should be filtered out from creating debug file
					() => false,
					(err) => {
						if (err.code === "ENOENT") {
							// if the file can't be found, it should be included in creating debug file
							return resource;
						}
						// if it's other error, forward it
						throw err;
					}
				);
		})
	).then((results) => {
		// filter out the resouces whose debug source path is already used
		return results.filter((result) => {
			return !!result;
		});
	}).then((filteredResources) => {
		return copier({
			resources: filteredResources,
			options: options
		});
	});
};
