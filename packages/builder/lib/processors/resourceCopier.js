/**
 * Copy files to a different path.
 *
 * @public
 * @alias module:@ui5/builder.processors.resourceCopier
 * @param {object} parameters Parameters
 * @param {module:@ui5/fs.Resource[]} parameters.resources List of resources to be processed
 * @param {object} parameters.options Options
 * @param {string} parameters.options.pattern Search pattern for path
 * @param {string} parameters.options.replacement Replacement string for path
 * @returns {Promise<module:@ui5/fs.Resource[]>} Promise resolving with the cloned resources
 */
module.exports = function({resources, options: {pattern, replacement}}) {
	if (!pattern || typeof replacement !== "string") {
		return Promise.reject(new Error("[resourceCopier] Invalid options: Missing pattern or replacement."));
	}

	return Promise.all(resources.map((resource) => {
		return resource.clone().then((newResource) => {
			newResource.setPath(newResource.getPath().replace(pattern, replacement));
			return newResource;
		});
	}));
};
