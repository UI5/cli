const nonAsciiEscaper = require("../../processors/nonAsciiEscaper");

/**
 * Can be used to escape *.properties files.
 *
 * Input encoding is read from project configuration.
 * In case the resource belongs to no project (e.g. bundler is used standalone) the default is "ISO-8859-1".
 *
 * @private
 * @param {Resource} resource the resource for which the content will be escaped
 * @returns {Promise<string>} resolves with the escaped string content of the given Resource
 */
module.exports = async function(resource) {
	const propertiesFileSourceEncoding = resource.getProject()
			&& resource.getProject().resources
			&& resource.getProject().resources.configuration
			&& resource.getProject().resources.configuration.propertiesFileSourceEncoding;
	const encoding = nonAsciiEscaper.getEncodingFromAlias(propertiesFileSourceEncoding || "ISO-8859-1");
	await nonAsciiEscaper({
		resources: [resource.resource],
		options: {
			encoding
		}
	});

	const fileContent = await resource.buffer();

	return fileContent.toString();
};
