/**
 * @public
 * @module @ui5/builder/processors/stringReplacer
 */

/**
 * Replaces placeholders with corresponding values.
 *
 * @public
 * @function default
 * @static
 *
 * @param {object} parameters Parameters
 * @param {@ui5/fs/Resource[]} parameters.resources List of resources to be processed
 * @param {object} parameters.options Options
 * @param {string} parameters.options.pattern Pattern of placeholders
 * @param {string} parameters.options.replacement Replacement for placeholders
 * @returns {Promise<@ui5/fs/Resource[]>} Promise resolving with modified resources
 */
export default function({resources, options: {pattern, replacement}}) {
	return Promise.all(resources.map(async (resource) => {
		const content = await resource.getString();
		const newContent = content.replaceAll(pattern, replacement);
		if (content !== newContent) {
			resource.setString(newContent);
		}
		return resource;
	}));
}
