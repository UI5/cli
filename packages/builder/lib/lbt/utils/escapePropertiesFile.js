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
	const project = resource.getProject();
	let propertiesFileSourceEncoding = project &&
			project.resources &&
			project.resources.configuration &&
			project.resources.configuration.propertiesFileSourceEncoding;

	if (!propertiesFileSourceEncoding) {
		if (project && ["0.1", "1.0", "1.1"].includes(project.specVersion)) {
			// default encoding to "ISO-8859-1" for old specVersions
			propertiesFileSourceEncoding = "ISO-8859-1";
		} else {
			// default encoding to "UTF-8" for all projects starting with specVersion 2.0
			propertiesFileSourceEncoding = "UTF-8";
		}
	}
	const encoding = nonAsciiEscaper.getEncodingFromAlias(propertiesFileSourceEncoding);
	await nonAsciiEscaper({
		resources: [resource.resource],
		options: {
			encoding
		}
	});

	const fileContent = await resource.buffer();

	return fileContent.toString();
};
