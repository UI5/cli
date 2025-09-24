import nonAsciiEscaper from "../../processors/nonAsciiEscaper.js";

/**
 * Can be used to escape *.properties files.
 *
 * Input encoding is read from project configuration.
 * In case the resource belongs to no project (e.g. bundler is used standalone) the default is "UTF-8".
 *
 * @private
 * @param {Resource} resource the resource for which the content will be escaped
 * @returns {Promise<string>} resolves with the escaped string content of the given Resource
 */
export default async function(resource) {
	const project = resource.getProject();
	let propertiesFileSourceEncoding = project && project.getPropertiesFileSourceEncoding();

	if (!propertiesFileSourceEncoding) {
		if (project && project.getSpecVersion().lte("1.1")) {
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
}
