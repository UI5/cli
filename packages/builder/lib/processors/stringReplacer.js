import replaceStream from "replacestream";

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
	return Promise.all(resources.map((resource) => {
		let stream = resource.getStream();
		stream.setEncoding("utf8");
		stream = stream.pipe(replaceStream(pattern, replacement));

		resource.setStream(stream);
		return resource;
	}));
}
